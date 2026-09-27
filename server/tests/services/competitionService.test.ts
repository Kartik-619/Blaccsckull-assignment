import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  ADMIN_STATUS,
  DANCE_FORMS,
  LIFECYCLE_STATUS,
  PARTICIPATION_STATUS,
  USER_RELATIONSHIP,
} from '../../src/constants/enums';
import { Competition } from '../../src/models/Competition';
import { Participation } from '../../src/models/Participation';
import type { UserDoc } from '../../src/models/User';
import {
  deriveUserRelationship,
  getCompetitionDetails,
  getCompetitionList,
  type CompetitionListResult,
  type CompetitionSummary,
} from '../../src/services/competitionService';
import { ERROR_CODES } from '../../src/utils/errors';
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

let organizer: UserDoc;

beforeEach(async () => {
  organizer = await makeOrganizer();
});

function openCompetition(overrides: Omit<CompetitionOverrides, 'organizerId'> = {}) {
  return makeCompetition({ now: Date.now(), organizerId: organizer._id, ...overrides });
}

// `items[0]` is `T | undefined` under `noUncheckedIndexedAccess`, and every
// caller here means "the one competition I just created", so the assertion
// belongs in one place rather than in each test.
function firstItem(result: CompetitionListResult): CompetitionSummary {
  const [item] = result.items;
  assert.ok(item, 'expected the list to hold at least one competition');
  return item;
}

describe('deriveUserRelationship', () => {
  it('reports no relationship when there is no participation at all', () => {
    assert.equal(deriveUserRelationship(null), USER_RELATIONSHIP.NOT_REGISTERED);
  });

  it('maps every stored status onto a relationship', () => {
    assert.equal(deriveUserRelationship({ status: 'REGISTERED' }), USER_RELATIONSHIP.REGISTERED);
    assert.equal(deriveUserRelationship({ status: 'CANCELLED' }), USER_RELATIONSHIP.CANCELLED);
    assert.equal(deriveUserRelationship({ status: 'WAITLISTED' }), USER_RELATIONSHIP.WAITLISTED);
  });
});

describe('getCompetitionDetails', () => {
  it('rejects a malformed competition id', async () => {
    await assert.rejects(getCompetitionDetails('not-an-id'), { code: ERROR_CODES.INVALID_ID });
  });

  it('rejects an unknown competition id', async () => {
    await assert.rejects(getCompetitionDetails('507f1f77bcf86cd799439011'), {
      code: ERROR_CODES.COMPETITION_NOT_FOUND,
    });
  });

  it('returns the full document with the derived read model attached', async () => {
    const competition = await openCompetition({ description: 'Long form fixture.' });

    const details = await getCompetitionDetails(competition.id);

    assert.equal(details.description, 'Long form fixture.');
    assert.equal(details.lifecycleStatus, LIFECYCLE_STATUS.REGISTRATION_OPEN);
    assert.equal(details.spotsRemaining, 2);
    assert.equal(details.isFull, false);
    assert.equal(details.isRegistrationOpen, true);
    assert.ok(details.serverTime);
    assert.equal(details.userState, null);
  });

  it('closes registration once the event has started', async () => {
    const now = Date.now();
    const competition = await openCompetition({
      now,
      registrationClosesAt: new Date(now - 2 * HOUR_MS),
    });

    const details = await getCompetitionDetails(competition.id);

    assert.equal(details.lifecycleStatus, LIFECYCLE_STATUS.REGISTRATION_CLOSED);
    assert.equal(details.isRegistrationOpen, false);
  });

  it('reports a full competition as closed for registration even mid-window', async () => {
    const competition = await openCompetition({ maxParticipants: 3, currentParticipantCount: 3 });

    const details = await getCompetitionDetails(competition.id);

    assert.equal(details.lifecycleStatus, LIFECYCLE_STATUS.REGISTRATION_OPEN);
    assert.equal(details.isRegistrationOpen, false);
    assert.equal(details.isFull, true);
    assert.equal(details.spotsRemaining, 0);
  });

  it('rejects an unknown user id before reading the participation', async () => {
    const competition = await openCompetition();

    await assert.rejects(getCompetitionDetails(competition.id, '507f1f77bcf86cd799439011'), {
      code: ERROR_CODES.USER_NOT_FOUND,
    });
  });

  it('offers registration to a matching dancer who has not registered', async () => {
    const competition = await openCompetition();
    const user = await makeUser({ primaryDanceForm: competition.danceForm });

    const details = await getCompetitionDetails(competition.id, user.id);

    // userState is nullable by contract, so every read of it has to say so.
    assert.ok(details.userState);
    assert.equal(details.userState.relationship, USER_RELATIONSHIP.NOT_REGISTERED);
    assert.equal(details.userState.canRegister, true);
    assert.equal(details.userState.reasonIfNotAllowed, null);
    assert.equal(details.userState.canCancel, false);
    assert.equal(details.userState.reasonIfCancelNotAllowed, ERROR_CODES.NOT_REGISTERED);
  });

  it('tells a registered dancer that they are already in, and that they may cancel', async () => {
    const competition = await openCompetition({ maxParticipants: 5 });
    const user = await makeUser();
    await makeParticipation({
      competitionId: competition._id,
      userId: user._id,
      slotNumber: 1,
    });

    const details = await getCompetitionDetails(competition.id, user.id);

    assert.ok(details.userState);
    assert.equal(details.userState.relationship, USER_RELATIONSHIP.REGISTERED);
    assert.equal(details.userState.canRegister, false);
    assert.equal(details.userState.reasonIfNotAllowed, ERROR_CODES.ALREADY_REGISTERED);
    assert.equal(details.userState.canCancel, true);
    assert.equal(details.userState.slotNumber, 1);
  });

  it('lets a cancelled dancer register again', async () => {
    const competition = await openCompetition();
    const user = await makeUser();
    await makeParticipation({
      competitionId: competition._id,
      userId: user._id,
      status: PARTICIPATION_STATUS.CANCELLED,
    });

    const details = await getCompetitionDetails(competition.id, user.id);

    assert.ok(details.userState);
    assert.equal(details.userState.relationship, USER_RELATIONSHIP.CANCELLED);
    assert.equal(details.userState.canRegister, true);
    assert.equal(details.userState.reasonIfNotAllowed, null);
  });

  it('blocks a dancer whose primary form does not match the competition', async () => {
    const competition = await openCompetition({ danceForm: DANCE_FORMS.KATHAK });
    const user = await makeUser({ primaryDanceForm: DANCE_FORMS.ODISSI });

    const details = await getCompetitionDetails(competition.id, user.id);

    assert.ok(details.userState);
    assert.equal(details.userState.reasonIfNotAllowed, ERROR_CODES.DANCE_FORM_MISMATCH);
  });

  it('blocks a full competition before considering the dancer', async () => {
    const competition = await openCompetition({ maxParticipants: 1, currentParticipantCount: 1 });
    const user = await makeUser({ primaryDanceForm: DANCE_FORMS.ODISSI });

    const details = await getCompetitionDetails(competition.id, user.id);

    assert.ok(details.userState);
    assert.equal(details.userState.reasonIfNotAllowed, ERROR_CODES.COMPETITION_FULL);
  });

  it('blocks an event cancelled by an administrator', async () => {
    const competition = await openCompetition({ adminStatus: ADMIN_STATUS.CANCELLED });

    const details = await getCompetitionDetails(competition.id);

    assert.equal(details.lifecycleStatus, LIFECYCLE_STATUS.CANCELLED);
    assert.equal(details.isRegistrationOpen, false);
    assert.equal(details.userState, null);
  });

  it('blocks an event that has not opened registration yet', async () => {
    const now = Date.now();
    const competition = await openCompetition({
      now,
      registrationOpensAt: new Date(now + HOUR_MS),
      registrationClosesAt: new Date(now + 2 * HOUR_MS),
    });

    const details = await getCompetitionDetails(competition.id);

    assert.equal(details.lifecycleStatus, LIFECYCLE_STATUS.UPCOMING);
    assert.equal(details.isRegistrationOpen, false);
  });

  it('refuses a cancellation made after the cancellation deadline', async () => {
    const now = Date.now();
    const past = new Date(now - HOUR_MS);
    const competition = await openCompetition({ now, cancellationClosesAt: past });
    const user = await makeUser();
    await makeParticipation({ competitionId: competition._id, userId: user._id });

    const details = await getCompetitionDetails(competition.id, user.id);

    assert.ok(details.userState);
    assert.equal(details.userState.canCancel, false);
    assert.equal(
      details.userState.reasonIfCancelNotAllowed,
      ERROR_CODES.CANCELLATION_NOT_ALLOWED,
    );
  });

  it('reads the newest participation after a cancel and re-register', async () => {
    const competition = await openCompetition();
    const user = await makeUser();
    await makeParticipation({
      competitionId: competition._id,
      userId: user._id,
      status: PARTICIPATION_STATUS.CANCELLED,
    });
    await makeParticipation({
      competitionId: competition._id,
      userId: user._id,
      status: PARTICIPATION_STATUS.REGISTERED,
    });

    const details = await getCompetitionDetails(competition.id, user.id);

    assert.ok(details.userState);
    assert.equal(details.userState.relationship, USER_RELATIONSHIP.REGISTERED);
  });
});

describe('getCompetitionList', () => {
  it('paginates and reports the total, defaulting to the first page of twenty', async () => {
    for (let index = 0; index < 3; index += 1) {
      await openCompetition();
    }

    const result = await getCompetitionList();

    assert.equal(result.items.length, 3);
    assert.deepEqual(result.pagination, { page: 1, limit: 20, total: 3, totalPages: 1 });
  });

  it('clamps a hostile limit to fifty', async () => {
    const result = await getCompetitionList({}, { limit: 5000 });

    assert.equal(result.pagination.limit, 50);
  });

  it('slices the requested page', async () => {
    const now = Date.now();
    await openCompetition({ now, startsAt: new Date(now + 3 * HOUR_MS) });
    await openCompetition({ now, startsAt: new Date(now + HOUR_MS) });
    await openCompetition({ now, startsAt: new Date(now + 2 * HOUR_MS) });

    const result = await getCompetitionList({}, { page: 2, limit: 1 });

    assert.equal(result.items.length, 1);
    assert.equal(result.pagination.total, 3);
    assert.equal(result.pagination.totalPages, 3);
  });

  it('sorts by start time unless asked otherwise', async () => {
    const now = Date.now();
    await openCompetition({ now, startsAt: new Date(now + 3 * HOUR_MS) });
    await openCompetition({ now, startsAt: new Date(now + HOUR_MS) });

    const result = await getCompetitionList();

    const starts = result.items.map((item) => new Date(item.startsAt).getTime());
    assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  });

  it('ignores a sort field that is not on the allow-list', async () => {
    const now = Date.now();
    await openCompetition({ now, startsAt: new Date(now + 3 * HOUR_MS) });
    await openCompetition({ now, startsAt: new Date(now + HOUR_MS) });

    const ascending = await getCompetitionList({ sortBy: 'startsAt' });
    // The service is callable without HTTP, so it has to defend itself: a field
    // the validator would have rejected still has to fall back to the default.
    const injected = await getCompetitionList({ sortBy: 'entryFee.amount' });
    const descending = await getCompetitionList({ sortBy: 'startsAt', sortOrder: 'desc' });

    assert.deepEqual(injected.items.map((i) => i._id), ascending.items.map((i) => i._id));
    assert.deepEqual(
      descending.items.map((i) => i._id),
      [...ascending.items.map((i) => i._id)].reverse(),
    );
  });

  it('filters by dance form and tag', async () => {
    await openCompetition({ danceForm: DANCE_FORMS.KATHAK, tags: ['amateur'] });
    await openCompetition({ danceForm: DANCE_FORMS.ODISSI });

    const result = await getCompetitionList({ danceForm: DANCE_FORMS.KATHAK, tag: 'amateur' });

    assert.equal(result.pagination.total, 1);
    assert.equal(result.items[0]?.danceForm, DANCE_FORMS.KATHAK);
  });

  it('matches a search prefix on the title or the slug', async () => {
    await openCompetition({ title: 'Monsoon Heats', slug: 'monsoon-heats-2026' });
    await openCompetition({ title: 'Winter Heats', slug: 'winter-heats-2026' });

    const byTitle = await getCompetitionList({ search: 'monsoon' });
    const bySlug = await getCompetitionList({ search: 'winter-heats-2026' });

    assert.equal(byTitle.pagination.total, 1);
    assert.equal(bySlug.pagination.total, 1);
  });

  it('does not match a search term in the middle of a title', async () => {
    await openCompetition({ title: 'Monsoon Heats' });

    const result = await getCompetitionList({ search: 'ons' });

    assert.equal(result.pagination.total, 0);
  });

  it('hides cancelled competitions unless they are asked for', async () => {
    await openCompetition({ adminStatus: ADMIN_STATUS.CANCELLED });
    await openCompetition();

    const hidden = await getCompetitionList();
    const shown = await getCompetitionList({ adminStatus: ADMIN_STATUS.CANCELLED });

    assert.equal(hidden.pagination.total, 1);
    assert.equal(shown.pagination.total, 1);
  });

  it('returns only competitions whose window is open and which have room', async () => {
    const now = Date.now();
    await openCompetition({ now });
    await openCompetition({ now, maxParticipants: 1, currentParticipantCount: 1 });
    await openCompetition({ now, registrationClosesAt: new Date(now - HOUR_MS) });

    const result = await getCompetitionList({ registrationOpenOnly: true });

    assert.equal(result.pagination.total, 1);
    assert.equal(result.items[0]?.isRegistrationOpen, true);
  });

  it('returns only competitions that have not started yet', async () => {
    const now = Date.now();
    await openCompetition({ now });
    await openCompetition({ now, startsAt: new Date(now - 2 * HOUR_MS) });

    const result = await getCompetitionList({ upcomingOnly: true });

    assert.equal(result.pagination.total, 1);
  });

  it('projects away the heavy fields and carries no per-user state', async () => {
    await openCompetition({ rules: ['no smoke'], adminNote: 'internal' });

    const item = firstItem(await getCompetitionList());

    // `in` rather than a comparison against undefined: the fields are absent
    // from the projection, so the honest assertion is absence, and the list item
    // type no longer names them at all.
    assert.equal('description' in item, false);
    assert.equal('rules' in item, false);
    assert.equal('adminNote' in item, false);
    assert.equal('referralPolicy' in item, false);
    assert.equal('userState' in item, false);
    assert.ok(item.entryFee, 'the entry fee is what a list card renders');
  });

  it('never leaks another dancer\'s participation into a listing', async () => {
    const competition = await openCompetition();
    const user = await makeUser();
    await makeParticipation({ competitionId: competition._id, userId: user._id });

    const result = await getCompetitionList();

    assert.equal(result.items.length, 1);
    assert.equal(await Participation.countDocuments({ competitionId: competition._id }), 1);
  });

  it('agrees with the detail read model on a competition with a full roster', async () => {
    const competition = await openCompetition({ maxParticipants: 1, currentParticipantCount: 1 });

    const item = firstItem(await getCompetitionList());
    const details = await getCompetitionDetails(competition.id);

    assert.equal(item.lifecycleStatus, details.lifecycleStatus);
    assert.equal(item.isRegistrationOpen, details.isRegistrationOpen);
    assert.equal(await Competition.countDocuments({ _id: competition._id }), 1);
  });
});
