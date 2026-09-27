import type { Types } from 'mongoose';

import {
  ADMIN_STATUS,
  DANCE_FORMS,
  PARTICIPATION_STATUS,
  USER_ROLE,
} from '../../src/constants/enums';
import { Competition, type CompetitionAttrs } from '../../src/models/Competition';
import {
  Participation,
  type ParticipationAttrs,
} from '../../src/models/Participation';
import { User, type UserAttrs } from '../../src/models/User';

export const HOUR_MS = 60 * 60 * 1000;

// Fixtures build documents field by field, so every field they may set has to be
// optional. `Date` and arrays are handled explicitly because a plain mapped
// partial turns a date into `{}` and an array into an object with array keys.
type DeepPartial<T> = T extends Date
  ? T
  : T extends readonly (infer U)[]
    ? U[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type CompetitionOverrides = DeepPartial<CompetitionAttrs> & {
  now?: number;
  // Required rather than defaulted to null: every caller supplies a real
  // organiser, and a placeholder null would have failed schema validation if one
  // ever used this factory directly.
  organizerId: Types.ObjectId;
};

export type UserOverrides = DeepPartial<UserAttrs>;

export type ParticipationOverrides = DeepPartial<ParticipationAttrs> & {
  competitionId: Types.ObjectId;
  userId: Types.ObjectId;
};

// Slugs, titles and emails share one counter so every fixture in a run is
// distinct without the caller having to invent a name.
let sequence = 0;
function nextLabel(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

// Services read the clock themselves, so windows are built from a `now` the test
// supplies. Boundaries sit at least an hour from that instant, which keeps an
// assertion from landing on a boundary because a slow machine took longer.
export function makeCompetition(options: CompetitionOverrides) {
  const { now = Date.now(), organizerId, ...overrides } = options;
  const label = nextLabel('competition');

  return Competition.create({
    slug: label,
    title: `Test Heats ${label}`,
    description: 'Fixture competition.',
    danceForm: DANCE_FORMS.BHARATANATYAM,
    organizerId,
    registrationOpensAt: new Date(now - 2 * HOUR_MS),
    registrationClosesAt: new Date(now + 2 * HOUR_MS),
    startsAt: new Date(now + 24 * HOUR_MS),
    endsAt: new Date(now + 26 * HOUR_MS),
    maxParticipants: 2,
    minParticipants: 0,
    currentParticipantCount: 0,
    entryFee: { amount: 1000, currency: 'INR' },
    referralPolicy: { enabled: false },
    adminStatus: ADMIN_STATUS.NONE,
    ...overrides,
  });
}

export function makeUser(overrides: UserOverrides = {}) {
  const label = nextLabel('user');

  return User.create({
    name: `Dancer ${label}`,
    email: `${label}@example.com`,
    primaryDanceForm: DANCE_FORMS.BHARATANATYAM,
    ...overrides,
  });
}

export function makeOrganizer() {
  return makeUser({ role: USER_ROLE.ORGANIZER });
}

export function makeParticipation(options: ParticipationOverrides) {
  const { competitionId, userId, ...overrides } = options;

  return Participation.create({
    competitionId,
    userId,
    status: PARTICIPATION_STATUS.REGISTERED,
    finalEntryFee: 0,
    ...overrides,
  });
}
