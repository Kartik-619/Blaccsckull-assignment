import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  ADMIN_STATUS,
  DANCE_FORMS,
  DISCOUNT_TYPE,
  PARTICIPATION_STATUS,
  USER_RELATIONSHIP,
} from '../../src/constants/enums';
import { Competition, type CompetitionAttrs } from '../../src/models/Competition';
import { Participation, type ParticipationDoc } from '../../src/models/Participation';
import type { UserDoc } from '../../src/models/User';
import { cancelRegistration, registerUser } from '../../src/services/registrationService';
import { AppError, ERROR_CODES, isAppError, type ErrorCode } from '../../src/utils/errors';
import {
  HOUR_MS,
  makeCompetition,
  makeOrganizer,
  makeParticipation,
  makeUser,
  type CompetitionOverrides,
} from '../helpers/fixtures';
import { resetDatabase, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb';

before(startMemoryDb);
after(stopMemoryDb);
beforeEach(resetDatabase);

const UNKNOWN_ID = '507f1f77bcf86cd799439011';

let organizer: UserDoc;

beforeEach(async () => {
  organizer = await makeOrganizer();
});

function openCompetition(overrides: Omit<CompetitionOverrides, 'organizerId'> = {}) {
  return makeCompetition({ now: Date.now(), organizerId: organizer._id, ...overrides });
}

type ReferralPolicy = CompetitionAttrs['referralPolicy'];

function referralPolicy(overrides: Partial<ReferralPolicy> = {}): ReferralPolicy {
  return {
    enabled: true,
    discountType: DISCOUNT_TYPE.FLAT,
    discountValue: 200,
    maxDiscountAmount: 0,
    codePrefix: 'FEED',
    rewardAmount: 10,
    ...overrides,
  };
}

async function findParticipation(
  competition: { _id: UserDoc['_id'] },
  user: UserDoc,
): Promise<ParticipationDoc> {
  const participation = await Participation.findOne({
    competitionId: competition._id,
    userId: user._id,
  });
  assert.ok(participation, 'expected a participation row to exist');
  return participation;
}

async function findCompetition(id: string) {
  const competition = await Competition.findById(id);
  assert.ok(competition, 'expected the competition to exist');
  return competition;
}

// A rejected promise's `reason` is typed `any` in the standard library, so
// reading `.code` off it would be the one place in the suite where a type says
// nothing. Reading it through a guard means every assertion on a rejection
// reason is checked against `ErrorCode` like everything else.
function reasonCode(result: PromiseSettledResult<unknown>): ErrorCode {
  assert.equal(result.status, 'rejected', 'expected this attempt to have been rejected');
  assert.ok(isAppError(result.reason), 'expected the rejection to be an AppError');
  return result.reason.code;
}

// Mongoose 9 runs no middleware on `create`, so replacing the static is the only
// seam that can fail an insert part-way through a registration. Swapping a
// third-party static for a double is the one thing here the type system cannot
// describe, so this helper owns the single cast and always restores the
// original: a double that leaked past its test would silently break every test
// that ran after it, which is the worst possible failure for a test double.
async function withCreateOverride(
  override: (real: CreateFn) => CreateFn,
  run: () => Promise<unknown>,
): Promise<unknown> {
  const model = Participation as unknown as { create: CreateFn };
  const real = model.create;

  model.create = override(real);
  try {
    return await run();
  } finally {
    model.create = real;
  }
}

type CreateFn = (...args: unknown[]) => Promise<ParticipationDoc>;

describe('registerUser', () => {
  it('rejects a malformed competition id', async () => {
    await assert.rejects(registerUser('nope', UNKNOWN_ID), { code: ERROR_CODES.INVALID_ID });
  });

  it('rejects an unknown competition', async () => {
    await assert.rejects(registerUser(UNKNOWN_ID, UNKNOWN_ID), {
      code: ERROR_CODES.COMPETITION_NOT_FOUND,
    });
  });

  it('rejects an unknown dancer', async () => {
    const competition = await openCompetition();

    await assert.rejects(registerUser(competition.id, UNKNOWN_ID), {
      code: ERROR_CODES.USER_NOT_FOUND,
    });
  });

  it('registers a dancer and returns the fresh state without a follow-up read', async () => {
    const competition = await openCompetition({ maxParticipants: 4 });
    const user = await makeUser();

    const result = await registerUser(competition.id, user.id);

    assert.ok(result.userState);
    assert.equal(result.currentParticipantCount, 1);
    assert.equal(result.spotsRemaining, 3);
    assert.equal(result.userState.relationship, USER_RELATIONSHIP.REGISTERED);
    assert.equal(result.userState.slotNumber, 1);
    assert.equal(result.userState.canRegister, false);
    assert.equal(result.userState.canCancel, true);
  });

  it('charges the full entry fee when no referral code is given', async () => {
    const competition = await openCompetition({ entryFee: { amount: 1000, currency: 'INR' } });
    const user = await makeUser();

    await registerUser(competition.id, user.id);

    const participation = await findParticipation(competition, user);
    assert.equal(participation.finalEntryFee, 1000);
    assert.equal(participation.appliedReferralCode, undefined);
  });

  it('refuses a dancer whose primary form does not match, without taking a spot', async () => {
    const competition = await openCompetition({ danceForm: DANCE_FORMS.KATHAK });
    const user = await makeUser({ primaryDanceForm: DANCE_FORMS.ODISSI });

    await assert.rejects(registerUser(competition.id, user.id), {
      code: ERROR_CODES.DANCE_FORM_MISMATCH,
    });

    const stored = await findCompetition(competition.id);
    assert.equal(stored.currentParticipantCount, 0);
    assert.equal(await Participation.countDocuments({}), 0);
  });

  it('refuses registration before the window opens', async () => {
    const now = Date.now();
    const competition = await openCompetition({
      now,
      registrationOpensAt: new Date(now + HOUR_MS),
      registrationClosesAt: new Date(now + 2 * HOUR_MS),
    });
    const user = await makeUser();

    await assert.rejects(registerUser(competition.id, user.id), {
      code: ERROR_CODES.REGISTRATION_NOT_OPEN,
    });
    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 0);
  });

  it('refuses registration after the window closes', async () => {
    const now = Date.now();
    const competition = await openCompetition({
      now,
      registrationOpensAt: new Date(now - 3 * HOUR_MS),
      registrationClosesAt: new Date(now - HOUR_MS),
    });
    const user = await makeUser();

    await assert.rejects(registerUser(competition.id, user.id), {
      code: ERROR_CODES.REGISTRATION_CLOSED,
    });
  });

  it('refuses an event an administrator has cancelled', async () => {
    const competition = await openCompetition({ adminStatus: ADMIN_STATUS.CANCELLED });
    const user = await makeUser();

    await assert.rejects(registerUser(competition.id, user.id), {
      code: ERROR_CODES.COMPETITION_CANCELLED,
    });
  });

  it('refuses a full competition and leaves the counter alone', async () => {
    const competition = await openCompetition({ maxParticipants: 1, currentParticipantCount: 1 });
    const user = await makeUser();

    await assert.rejects(registerUser(competition.id, user.id), {
      code: ERROR_CODES.COMPETITION_FULL,
    });
    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 1);
    assert.equal(await Participation.countDocuments({}), 0);
  });

  it('releases the taken spot when the same dancer registers twice', async () => {
    const competition = await openCompetition({ maxParticipants: 4 });
    const user = await makeUser();
    await registerUser(competition.id, user.id);

    await assert.rejects(registerUser(competition.id, user.id), {
      code: ERROR_CODES.ALREADY_REGISTERED,
    });

    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 1);
    const active = await Participation.countDocuments({
      status: PARTICIPATION_STATUS.REGISTERED,
    });
    assert.equal(active, 1);
  });

  it('releases the taken spot when the insert fails for any other reason', async () => {
    // The compensation used to run only for a duplicate key, so a validation or
    // network failure on the insert leaked a seat for the life of the event.
    // This is the test that pins the fix: the row never lands, so the counter
    // must not move at all.
    const competition = await openCompetition({ maxParticipants: 4 });
    const user = await makeUser();

    await assert.rejects(
      withCreateOverride(
        () => async (): Promise<ParticipationDoc> => {
          throw new Error('insert failed for a reason that is not a duplicate key');
        },
        () => registerUser(competition.id, user.id),
      ),
      /insert failed/,
    );

    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 0);
    assert.equal(await Participation.countDocuments({}), 0);
  });

  it('lets a dancer re-register after cancelling', async () => {
    const competition = await openCompetition();
    const user = await makeUser();
    await registerUser(competition.id, user.id);
    await cancelRegistration(competition.id, user.id);

    await registerUser(competition.id, user.id);

    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 1);
    const active = await Participation.countDocuments({
      status: PARTICIPATION_STATUS.REGISTERED,
    });
    assert.equal(active, 1);
    const cancelled = await Participation.countDocuments({
      status: PARTICIPATION_STATUS.CANCELLED,
    });
    assert.equal(cancelled, 1);
  });

  it('applies a flat referral discount to the entry fee', async () => {
    const competition = await openCompetition({ referralPolicy: referralPolicy() });
    const user = await makeUser();

    await registerUser(competition.id, user.id, 'FEED-ANN');

    const participation = await findParticipation(competition, user);
    assert.equal(participation.finalEntryFee, 800);
    assert.equal(participation.appliedReferralCode, 'FEED-ANN');
  });

  it('applies a percentage referral discount, matching the prefix case-insensitively', async () => {
    const competition = await openCompetition({
      entryFee: { amount: 1000, currency: 'INR' },
      referralPolicy: referralPolicy({ discountType: DISCOUNT_TYPE.PERCENTAGE, discountValue: 10 }),
    });
    const user = await makeUser();

    await registerUser(competition.id, user.id, 'feed-raj');

    const participation = await findParticipation(competition, user);
    assert.equal(participation.finalEntryFee, 900);
  });

  it('never discounts more than the cap allows', async () => {
    const competition = await openCompetition({
      entryFee: { amount: 1000, currency: 'INR' },
      referralPolicy: referralPolicy({
        discountType: DISCOUNT_TYPE.PERCENTAGE,
        discountValue: 50,
        maxDiscountAmount: 300,
      }),
    });
    const user = await makeUser();

    await registerUser(competition.id, user.id, 'FEED-ANN');

    const participation = await findParticipation(competition, user);
    assert.equal(participation.finalEntryFee, 700);
  });

  it('floors the entry fee at zero rather than paying the dancer', async () => {
    const competition = await openCompetition({
      entryFee: { amount: 100, currency: 'INR' },
      referralPolicy: referralPolicy({ discountValue: 500 }),
    });
    const user = await makeUser();

    await registerUser(competition.id, user.id, 'FEED-ANN');

    const participation = await findParticipation(competition, user);
    assert.equal(participation.finalEntryFee, 0);
  });

  it('rejects an expired referral code without taking a spot', async () => {
    const now = Date.now();
    const competition = await openCompetition({
      now,
      referralPolicy: referralPolicy({ validUntil: new Date(now - HOUR_MS) }),
    });
    const user = await makeUser();

    await assert.rejects(registerUser(competition.id, user.id, 'FEED-ANN'), {
      code: ERROR_CODES.REFERRAL_EXPIRED,
    });
    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 0);
  });

  it('rejects a referral code that does not carry the policy prefix', async () => {
    const competition = await openCompetition({ referralPolicy: referralPolicy() });
    const user = await makeUser();

    await assert.rejects(registerUser(competition.id, user.id, 'OTHER-ANN'), {
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  });

  it('rejects a referral code when the competition does not accept one', async () => {
    const disabled = referralPolicy({ enabled: false });
    const competition = await openCompetition({ referralPolicy: disabled });
    const user = await makeUser();

    await assert.rejects(registerUser(competition.id, user.id, 'FEED-ANN'), {
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  });

  it('gives the last spot to exactly one of five dancers racing for it', async () => {
    const competition = await openCompetition({ maxParticipants: 1 });
    const dancers = await Promise.all(Array.from({ length: 5 }, () => makeUser()));

    const attempts = await Promise.allSettled(
      dancers.map((dancer) => registerUser(competition.id, dancer.id)),
    );

    const winners = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const losers = attempts.filter((attempt) => attempt.status === 'rejected');
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 4);
    losers.forEach((loser) => assert.equal(reasonCode(loser), ERROR_CODES.COMPETITION_FULL));

    const stored = await findCompetition(competition.id);
    assert.equal(stored.currentParticipantCount, 1);
    assert.equal(await Participation.countDocuments({ competitionId: competition._id }), 1);
  });

  it('fills exactly the available spots when more dancers arrive than there is room', async () => {
    const competition = await openCompetition({ maxParticipants: 3 });
    const dancers = await Promise.all(Array.from({ length: 8 }, () => makeUser()));

    const attempts = await Promise.allSettled(
      dancers.map((dancer) => registerUser(competition.id, dancer.id)),
    );

    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 3);
    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 3);
    assert.equal(await Participation.countDocuments({ competitionId: competition._id }), 3);
  });

  it('gives a racing pair from one dancer one row and one spot', async () => {
    const competition = await openCompetition({ maxParticipants: 4 });
    const user = await makeUser();

    const attempts = await Promise.allSettled([
      registerUser(competition.id, user.id),
      registerUser(competition.id, user.id),
    ]);

    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(rejected.length, 1);

    // Whichever guard the loser hits, the invariant is the same: one row, one
    // increment. The code is either already-registered or full, and both are
    // rejections the caller is expected to handle.
    const expected: ErrorCode[] = [
      ERROR_CODES.ALREADY_REGISTERED,
      ERROR_CODES.COMPETITION_FULL,
    ];
    assert.ok(expected.includes(reasonCode(rejected[0] as PromiseRejectedResult)));
    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 1);
    assert.equal(await Participation.countDocuments({ competitionId: competition._id }), 1);
  });

  it('unwinds the whole registration when an administrator cancels mid-flight', async () => {
    const competition = await openCompetition({ maxParticipants: 5 });
    const user = await makeUser();

    // The reservation is a single atomic update, so the flip has to be slipped
    // in after it and before the insert: that is the one window a filter cannot
    // cover, and it is why the insert is compensated afterwards.
    const cancelBeforeInsert = (real: CreateFn): CreateFn => {
      return async function createAroundCancellation(...args: unknown[]) {
        await Competition.updateOne(
          { _id: competition._id },
          { $set: { adminStatus: ADMIN_STATUS.CANCELLED } },
        );
        // `create` is a static that reaches for its own model, so it has to keep
        // the receiver it was written for.
        return real.apply(Participation, args);
      };
    };

    await assert.rejects(
      withCreateOverride(cancelBeforeInsert, () => registerUser(competition.id, user.id)),
      { code: ERROR_CODES.COMPETITION_CANCELLED },
    );

    const stored = await findCompetition(competition.id);
    assert.equal(stored.adminStatus, ADMIN_STATUS.CANCELLED);
    assert.equal(stored.currentParticipantCount, 0);
    assert.equal(await Participation.countDocuments({ competitionId: competition._id }), 0);
  });
});

describe('cancelRegistration', () => {
  it('rejects a malformed competition id', async () => {
    await assert.rejects(cancelRegistration('nope', UNKNOWN_ID), { code: ERROR_CODES.INVALID_ID });
  });

  it('rejects a dancer who is not registered', async () => {
    const competition = await openCompetition();
    const user = await makeUser();

    await assert.rejects(cancelRegistration(competition.id, user.id), {
      code: ERROR_CODES.NOT_REGISTERED,
    });
  });

  it('rejects a second cancellation of the same registration', async () => {
    const competition = await openCompetition();
    const user = await makeUser();
    await registerUser(competition.id, user.id);
    await cancelRegistration(competition.id, user.id);

    await assert.rejects(cancelRegistration(competition.id, user.id), {
      code: ERROR_CODES.NOT_REGISTERED,
    });
    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 0);
  });

  it('frees the spot and reports the cancelled relationship', async () => {
    const competition = await openCompetition({ maxParticipants: 4 });
    const user = await makeUser();
    await registerUser(competition.id, user.id);

    const result = await cancelRegistration(competition.id, user.id);

    assert.ok(result.userState);
    assert.equal(result.currentParticipantCount, 0);
    assert.equal(result.spotsRemaining, 4);
    assert.equal(result.userState.relationship, USER_RELATIONSHIP.CANCELLED);
    assert.equal(result.userState.canCancel, false);
    assert.equal(result.userState.reasonIfCancelNotAllowed, ERROR_CODES.NOT_REGISTERED);
  });

  it('stamps the cancellation time', async () => {
    const competition = await openCompetition();
    const user = await makeUser();
    await registerUser(competition.id, user.id);

    await cancelRegistration(competition.id, user.id);

    const participation = await findParticipation(competition, user);
    assert.ok(participation.cancelledAt instanceof Date);
  });

  it('refuses a cancellation made after the deadline and keeps the spot', async () => {
    const now = Date.now();
    const deadline = new Date(now - HOUR_MS);
    const competition = await openCompetition({ now, cancellationClosesAt: deadline });
    const user = await makeUser();
    await registerUser(competition.id, user.id);

    await assert.rejects(cancelRegistration(competition.id, user.id), {
      code: ERROR_CODES.CANCELLATION_NOT_ALLOWED,
    });

    const participation = await findParticipation(competition, user);
    assert.equal(participation.status, PARTICIPATION_STATUS.REGISTERED);
    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 1);
  });

  it('allows a cancellation right up to the deadline', async () => {
    const now = Date.now();
    const deadline = new Date(now + HOUR_MS);
    const competition = await openCompetition({ now, cancellationClosesAt: deadline });
    const user = await makeUser();
    await registerUser(competition.id, user.id);

    await cancelRegistration(competition.id, user.id);

    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 0);
  });

  it('lets only one of two racing cancellations take effect', async () => {
    const competition = await openCompetition();
    const user = await makeUser();
    await registerUser(competition.id, user.id);

    const attempts = await Promise.allSettled([
      cancelRegistration(competition.id, user.id),
      cancelRegistration(competition.id, user.id),
    ]);

    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal(reasonCode(rejected[0] as PromiseRejectedResult), ERROR_CODES.NOT_REGISTERED);

    const stored = await findCompetition(competition.id);
    assert.equal(stored.currentParticipantCount, 0);
    const cancelled = await Participation.countDocuments({
      status: PARTICIPATION_STATUS.CANCELLED,
    });
    assert.equal(cancelled, 1);
  });

  it('never drives the counter below zero when cancellations outnumber spots', async () => {
    const competition = await openCompetition({ maxParticipants: 1 });
    const [first, second] = await Promise.all([makeUser(), makeUser()]);
    assert.ok(first && second, 'expected two dancers to be created');
    await registerUser(competition.id, first.id);

    const attempts = await Promise.allSettled([
      cancelRegistration(competition.id, first.id),
      cancelRegistration(competition.id, first.id),
    ]);

    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal((await findCompetition(competition.id)).currentParticipantCount, 0);
    const cancelled = await Participation.countDocuments({
      status: PARTICIPATION_STATUS.CANCELLED,
    });
    assert.equal(cancelled, 1);
  });
});
