import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ADMIN_STATUS,
  LIFECYCLE_STATUS,
  type LifecycleStatus,
} from '../../src/constants/enums';
import { deriveLifecycleStatus, type LifecycleInput } from '../../src/services/lifecycleService';
import { addSeconds } from '../../src/utils/time';

const SECOND = 1;
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const OPENS_AT = new Date('2026-01-01T00:00:00.000Z');
const CLOSES_AT = addSeconds(OPENS_AT, 7 * DAY);
const STARTS_AT = addSeconds(CLOSES_AT, 2 * DAY);
const ENDS_AT = addSeconds(STARTS_AT, 6 * HOUR);
const RESULTS_AT = addSeconds(ENDS_AT, DAY);

function buildCompetition(overrides: Partial<LifecycleInput> = {}): LifecycleInput {
  return {
    adminStatus: ADMIN_STATUS.NONE,
    registrationOpensAt: OPENS_AT,
    registrationClosesAt: CLOSES_AT,
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    resultsAnnouncedAt: RESULTS_AT,
    minParticipants: 10,
    currentParticipantCount: 40,
    ...overrides,
  };
}

// Typed rather than inferred so a case with a misspelled override key is a
// compile error instead of a silently ignored field.
interface LifecycleCase {
  name: string;
  now: Date;
  competition?: Partial<LifecycleInput>;
  expected: LifecycleStatus;
}

const CASES: LifecycleCase[] = [
  {
    name: 'admin cancellation outranks the clock',
    now: addSeconds(RESULTS_AT, DAY),
    competition: { adminStatus: ADMIN_STATUS.CANCELLED },
    expected: LIFECYCLE_STATUS.CANCELLED,
  },
  {
    name: 'admin cancellation outranks a live event',
    now: STARTS_AT,
    competition: { adminStatus: ADMIN_STATUS.CANCELLED },
    expected: LIFECYCLE_STATUS.CANCELLED,
  },
  {
    name: 'postponed still derives from the timestamps',
    now: addSeconds(OPENS_AT, DAY),
    competition: { adminStatus: ADMIN_STATUS.POSTPONED },
    expected: LIFECYCLE_STATUS.REGISTRATION_OPEN,
  },
  {
    name: 'postponed and past the end date is completed, not postponed',
    now: addSeconds(ENDS_AT, HOUR),
    competition: { adminStatus: ADMIN_STATUS.POSTPONED },
    expected: LIFECYCLE_STATUS.COMPLETED,
  },
  {
    name: 'before the window opens is upcoming',
    now: addSeconds(OPENS_AT, -SECOND),
    expected: LIFECYCLE_STATUS.UPCOMING,
  },
  {
    name: 'the opening instant is inclusive',
    now: OPENS_AT,
    expected: LIFECYCLE_STATUS.REGISTRATION_OPEN,
  },
  {
    name: 'mid window is registration open',
    now: addSeconds(OPENS_AT, 3 * DAY),
    expected: LIFECYCLE_STATUS.REGISTRATION_OPEN,
  },
  {
    name: 'the closing instant is still registration open',
    now: CLOSES_AT,
    expected: LIFECYCLE_STATUS.REGISTRATION_OPEN,
  },
  {
    name: 'one second after closing is registration closed',
    now: addSeconds(CLOSES_AT, SECOND),
    expected: LIFECYCLE_STATUS.REGISTRATION_CLOSED,
  },
  {
    name: 'the start instant is live',
    now: STARTS_AT,
    expected: LIFECYCLE_STATUS.LIVE,
  },
  {
    name: 'mid event is live',
    now: addSeconds(STARTS_AT, 2 * HOUR),
    expected: LIFECYCLE_STATUS.LIVE,
  },
  {
    name: 'the end instant is still live',
    now: ENDS_AT,
    expected: LIFECYCLE_STATUS.LIVE,
  },
  {
    name: 'one second after the end is completed',
    now: addSeconds(ENDS_AT, SECOND),
    expected: LIFECYCLE_STATUS.COMPLETED,
  },
  {
    name: 'the results instant itself is not yet published',
    now: RESULTS_AT,
    expected: LIFECYCLE_STATUS.COMPLETED,
  },
  {
    name: 'after results are announced',
    now: addSeconds(RESULTS_AT, SECOND),
    expected: LIFECYCLE_STATUS.RESULTS_PUBLISHED,
  },
  {
    name: 'no results timestamp can never publish',
    now: addSeconds(RESULTS_AT, 30 * DAY),
    competition: { resultsAnnouncedAt: undefined },
    expected: LIFECYCLE_STATUS.COMPLETED,
  },
  {
    name: 'under the minimum before the start is cancelled',
    now: addSeconds(CLOSES_AT, HOUR),
    competition: { currentParticipantCount: 9 },
    expected: LIFECYCLE_STATUS.CANCELLED_INSUFFICIENT_PARTICIPANTS,
  },
  {
    name: 'exactly the minimum before the start is not cancelled',
    now: addSeconds(CLOSES_AT, HOUR),
    competition: { currentParticipantCount: 10 },
    expected: LIFECYCLE_STATUS.REGISTRATION_CLOSED,
  },
  {
    name: 'one short of the minimum before the start is cancelled',
    now: addSeconds(CLOSES_AT, HOUR),
    competition: { currentParticipantCount: 0, minParticipants: 1 },
    expected: LIFECYCLE_STATUS.CANCELLED_INSUFFICIENT_PARTICIPANTS,
  },
  {
    name: 'an absent count is read as zero against a positive minimum',
    now: addSeconds(CLOSES_AT, HOUR),
    competition: { currentParticipantCount: undefined, minParticipants: 2 },
    expected: LIFECYCLE_STATUS.CANCELLED_INSUFFICIENT_PARTICIPANTS,
  },
  {
    name: 'a zero minimum can never cancel',
    now: addSeconds(CLOSES_AT, HOUR),
    competition: { currentParticipantCount: 0, minParticipants: 0 },
    expected: LIFECYCLE_STATUS.REGISTRATION_CLOSED,
  },
  {
    name: 'a live event under its minimum is still live',
    now: addSeconds(STARTS_AT, HOUR),
    competition: { currentParticipantCount: 1 },
    expected: LIFECYCLE_STATUS.LIVE,
  },
  {
    name: 'a finished event under its minimum is still completed',
    now: addSeconds(ENDS_AT, HOUR),
    competition: { currentParticipantCount: 1 },
    expected: LIFECYCLE_STATUS.COMPLETED,
  },
  {
    name: 'a cancelled event is cancelled even before its window opens',
    now: addSeconds(OPENS_AT, -30 * DAY),
    competition: { adminStatus: ADMIN_STATUS.CANCELLED },
    expected: LIFECYCLE_STATUS.CANCELLED,
  },
];

for (const testCase of CASES) {
  test(testCase.name, () => {
    const competition = buildCompetition(testCase.competition);
    assert.strictEqual(deriveLifecycleStatus(competition, testCase.now), testCase.expected);
  });
}

test('now is required, so no caller can derive against a wall clock', () => {
  // The signature is the assertion now: the call below does not compile, and
  // `@ts-expect-error` fails the build if `now` ever becomes optional, so the
  // guarantee cannot quietly rot. The runtime assertion is kept because it
  // documents what a JavaScript caller would hit.
  // @ts-expect-error `now` is a required parameter.
  assert.throws(() => deriveLifecycleStatus(buildCompetition()), TypeError);
});

test('a plain object is enough, the function never touches the database', () => {
  const competition = buildCompetition();
  assert.strictEqual(deriveLifecycleStatus(competition, STARTS_AT), LIFECYCLE_STATUS.LIVE);
});
