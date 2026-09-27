import { isValidObjectId } from 'mongoose';

import {
  ADMIN_STATUS,
  DISCOUNT_TYPE,
  PARTICIPATION_STATUS,
  type DiscountType,
} from '../constants/enums';
import {
  Competition,
  type CompetitionAttrs,
  type CompetitionDoc,
} from '../models/Competition';
import type { ParticipationDoc } from '../models/Participation';
import { Participation } from '../models/Participation';
import { User, type UserDoc } from '../models/User';
import { AppError, ERROR_CODES, isAppError } from '../utils/errors';
import { nowUtc } from '../utils/time';
import { buildCompetitionDetails, type CompetitionDetails } from './competitionService';

const DUPLICATE_KEY_CODE = 11000;

type ReferralPolicy = CompetitionAttrs['referralPolicy'];
type EntryFee = CompetitionAttrs['entryFee'];

interface CreateParticipationInput {
  competitionId: CompetitionDoc['_id'];
  userId: UserDoc['_id'];
  finalEntryFee: number;
  referralCode: string | undefined;
  slotNumber: number;
}

// Mongoose surfaces a duplicate key as a `MongoServerError`, which is a plain
// `Error` with a numeric `code`. Narrowing on the field is the only way to tell
// that apart from any other insert failure, and it is a guard rather than a cast
// so a caller that reaches the catch block cannot skip the check.
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}

async function loadCompetition(competitionId: string): Promise<CompetitionDoc> {
  if (!isValidObjectId(competitionId)) {
    throw AppError.fromCode(ERROR_CODES.INVALID_ID, 'Competition id is not a valid ObjectId.');
  }
  const competition = await Competition.findById(competitionId);
  if (!competition) {
    throw AppError.fromCode(ERROR_CODES.COMPETITION_NOT_FOUND, 'Competition not found.');
  }
  return competition;
}

async function loadUser(userId: string): Promise<UserDoc> {
  if (!isValidObjectId(userId)) {
    throw AppError.fromCode(ERROR_CODES.INVALID_ID, 'User id is not a valid ObjectId.');
  }
  const user = await User.findById(userId);
  if (!user) {
    throw AppError.fromCode(ERROR_CODES.USER_NOT_FOUND, 'User not found.');
  }
  return user;
}

function assertDanceFormMatches(
  user: Pick<UserDoc, 'primaryDanceForm'>,
  competition: Pick<CompetitionDoc, 'danceForm'>,
): void {
  if (user.primaryDanceForm !== competition.danceForm) {
    const message = `This competition is for ${competition.danceForm} dancers.`;
    throw AppError.fromCode(ERROR_CODES.DANCE_FORM_MISMATCH, message);
  }
}

// `maxDiscountAmount` defaults to 0, so 0 is read as "no cap": a literal zero
// cap would silently cancel every discount on a policy whose organiser simply
// never set the field.
function computeDiscountAmount(referralPolicy: ReferralPolicy, amount: number): number {
  const raw =
    referralPolicy.discountType === DISCOUNT_TYPE.PERCENTAGE
      ? (amount * referralPolicy.discountValue) / 100
      : referralPolicy.discountValue;

  if (referralPolicy.maxDiscountAmount === 0) {
    return raw;
  }
  return Math.min(raw, referralPolicy.maxDiscountAmount);
}

// There is no referral-code collection, so the code is validated against the
// policy alone: it must carry the configured prefix and the policy must still be
// inside its validity window. A code that cannot be applied is a bad request,
// not a business rule failure, which is why it is VALIDATION_ERROR and not one
// of the 4xx reason codes.
function computeFinalEntryFee(
  entryFee: EntryFee,
  referralPolicy: ReferralPolicy,
  referralCode: string | undefined,
  now: Date,
): number {
  if (referralCode === undefined) {
    return entryFee.amount;
  }
  if (!referralPolicy.enabled) {
    throw AppError.fromCode(
      ERROR_CODES.VALIDATION_ERROR,
      'This competition does not accept referral codes.',
    );
  }

  const prefix = referralPolicy.codePrefix ?? '';
  if (prefix === '' || !referralCode.toUpperCase().startsWith(prefix.toUpperCase())) {
    throw AppError.fromCode(
      ERROR_CODES.VALIDATION_ERROR,
      'Referral code is not valid for this competition.',
    );
  }
  if (referralPolicy.validUntil && now > referralPolicy.validUntil) {
    throw AppError.fromCode(ERROR_CODES.REFERRAL_EXPIRED, 'Referral code has expired.');
  }

  const discount = computeDiscountAmount(referralPolicy, entryFee.amount);
  return Math.max(0, entryFee.amount - discount);
}

// §8.3: the capacity check is part of the filter, never a read before a write.
async function reserveSlot(competitionId: CompetitionDoc['_id'], now: Date): Promise<CompetitionDoc> {
  const reserved = await Competition.findOneAndUpdate(
    {
      _id: competitionId,
      adminStatus: { $ne: ADMIN_STATUS.CANCELLED },
      registrationOpensAt: { $lte: now },
      registrationClosesAt: { $gte: now },
      // Capacity compares two fields of the same document, so it cannot be
      // written with a plain operator. Inside the filter it is evaluated under
      // the same lock as the increment, which is the whole point.
      $expr: { $lt: ['$currentParticipantCount', '$maxParticipants'] },
    },
    { $inc: { currentParticipantCount: 1 } },
    { returnDocument: 'after' },
  );

  if (reserved) {
    return reserved;
  }

  // Nothing matched. One read to find out which guard rejected us: the
  // competition may have changed since the failed attempt, so this is the
  // reason as of now, not as of a moment ago.
  const current = await Competition.findById(competitionId).select(
    'adminStatus registrationOpensAt registrationClosesAt currentParticipantCount maxParticipants',
  );
  if (!current) {
    throw AppError.fromCode(ERROR_CODES.COMPETITION_NOT_FOUND, 'Competition not found.');
  }
  if (current.adminStatus === ADMIN_STATUS.CANCELLED) {
    throw AppError.fromCode(ERROR_CODES.COMPETITION_CANCELLED, 'Competition was cancelled.');
  }
  if (current.registrationOpensAt > now) {
    throw AppError.fromCode(ERROR_CODES.REGISTRATION_NOT_OPEN, 'Registration has not opened yet.');
  }
  if (current.registrationClosesAt < now) {
    throw AppError.fromCode(ERROR_CODES.REGISTRATION_CLOSED, 'Registration is closed.');
  }
  throw AppError.fromCode(ERROR_CODES.COMPETITION_FULL, 'No spots remaining.');
}

// The `$gt: 0` guard is what stops the counter going negative if a decrement is
// ever issued against a competition that is already at zero.
async function releaseSlot(competitionId: CompetitionDoc['_id']): Promise<void> {
  await Competition.updateOne(
    { _id: competitionId, currentParticipantCount: { $gt: 0 } },
    { $inc: { currentParticipantCount: -1 } },
  );
}

async function createParticipation(
  input: CreateParticipationInput,
): Promise<ParticipationDoc> {
  const { competitionId, userId, finalEntryFee, referralCode, slotNumber } = input;

  try {
    const participation = await Participation.create({
      competitionId,
      userId,
      status: PARTICIPATION_STATUS.REGISTERED,
      finalEntryFee,
      appliedReferralCode: referralCode,
      slotNumber,
    });
    return participation;
  } catch (error) {
    // The seat is released for *every* insert failure, not only a duplicate. The
    // reservation has already been counted by the time this block runs, so
    // re-throwing without decrementing would lose that seat for the life of the
    // event. A duplicate is the expected case and gets the specific code; every
    // other failure is re-thrown unchanged once the counter is back where it was.
    await releaseSlot(competitionId);
    if (isDuplicateKeyError(error)) {
      // The unique partial index caught a second active registration.
      throw AppError.fromCode(
        ERROR_CODES.ALREADY_REGISTERED,
        'You are already registered for this competition.',
      );
    }
    throw error;
  }
}

// The admin can cancel between the reservation and the insert. The increment and
// the row are both undone so a cancelled event does not keep a participant and
// a participant does not keep a seat on a cancelled event.
async function rollbackIfCancelledAfterReservation(
  competitionId: CompetitionDoc['_id'],
  participation: Pick<ParticipationDoc, '_id'>,
): Promise<void> {
  const latest = await Competition.findById(competitionId).select('adminStatus');
  if (latest?.adminStatus !== ADMIN_STATUS.CANCELLED) {
    return;
  }
  await releaseSlot(competitionId);
  await Participation.deleteOne({ _id: participation._id });
  throw AppError.fromCode(ERROR_CODES.COMPETITION_CANCELLED, 'Competition was cancelled.');
}

export async function registerUser(
  competitionId: string,
  userId: string,
  referralCode?: string,
): Promise<CompetitionDetails> {
  const now = nowUtc();
  const appliedReferralCode = referralCode ? referralCode.trim() : undefined;
  const competition = await loadCompetition(competitionId);
  const user = await loadUser(userId);

  // Preconditions that do not need to be atomic. The window and capacity checks
  // are deliberately not here: they are the filter of the reservation below, so
  // a second user can never be told "open" from a stale read.
  assertDanceFormMatches(user, competition);
  const finalEntryFee = computeFinalEntryFee(
    competition.entryFee,
    competition.referralPolicy,
    appliedReferralCode,
    now,
  );

  const reserved = await reserveSlot(competition._id, now);
  const participation = await createParticipation({
    competitionId: competition._id,
    userId: user._id,
    finalEntryFee,
    referralCode: appliedReferralCode,
    slotNumber: reserved.currentParticipantCount,
  });

  await rollbackIfCancelledAfterReservation(competition._id, participation);

  // `reserved` is the document as the increment left it, so the response needs
  // no follow-up read to be fresh (§9.5).
  return buildCompetitionDetails({ competition: reserved, user, participation, now });
}

export async function cancelRegistration(
  competitionId: string,
  userId: string,
): Promise<CompetitionDetails> {
  const now = nowUtc();
  const competition = await loadCompetition(competitionId);
  const user = await loadUser(userId);

  const active = await Participation.findOne({
    competitionId: competition._id,
    userId: user._id,
    status: PARTICIPATION_STATUS.REGISTERED,
  })
    .select('_id')
    .lean();

  if (!active) {
    throw AppError.fromCode(ERROR_CODES.NOT_REGISTERED, 'You are not registered.');
  }
  if (competition.cancellationClosesAt && now > competition.cancellationClosesAt) {
    throw AppError.fromCode(
      ERROR_CODES.CANCELLATION_NOT_ALLOWED,
      'The cancellation window for this competition has closed.',
    );
  }

  // Guarded on the status so two parallel cancels cannot both report success:
  // the loser matches nothing and is told it was not registered.
  const cancelled = await Participation.findOneAndUpdate(
    { _id: active._id, status: PARTICIPATION_STATUS.REGISTERED },
    { $set: { status: PARTICIPATION_STATUS.CANCELLED, cancelledAt: now } },
    { returnDocument: 'after' },
  );

  if (!cancelled) {
    throw AppError.fromCode(ERROR_CODES.NOT_REGISTERED, 'You are not registered.');
  }

  await releaseSlot(competition._id);
  const refreshed = await Competition.findById(competition._id);
  // The cancellation has already been applied, so this only fires if the
  // competition was deleted mid-request. There is nothing left to describe, and
  // §9.5 says the response must be fresh, so it is an error rather than a
  // response built from a document that no longer exists.
  if (!refreshed) {
    throw AppError.fromCode(ERROR_CODES.COMPETITION_NOT_FOUND, 'Competition not found.');
  }

  return buildCompetitionDetails({ competition: refreshed, user, participation: cancelled, now });
}
