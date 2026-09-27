import { isValidObjectId, type QueryFilter, type SortOrder } from 'mongoose';

import {
  ADMIN_STATUS,
  LIFECYCLE_STATUS,
  PARTICIPATION_STATUS,
  USER_RELATIONSHIP,
  type AdminStatus,
  type DanceForm,
  type LifecycleStatus,
  type UserRelationship,
} from '../constants/enums';
import {
  Competition,
  type CompetitionAttrs,
  type CompetitionDoc,
  type CompetitionSnapshot,
} from '../models/Competition';
import type { ParticipationStatusSource } from '../models/Participation';
import { Participation } from '../models/Participation';
import { User, type UserAttrs, type UserDoc } from '../models/User';
import { AppError, ERROR_CODES, type ErrorCode } from '../utils/errors';
import { nowUtc } from '../utils/time';
import { deriveLifecycleStatus } from './lifecycleService';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH_LENGTH = 60;
const DEFAULT_SORT_FIELD = 'startsAt';
const SORT_FIELDS: Readonly<Record<string, SortOrder>> = Object.freeze({
  startsAt: 1,
  createdAt: -1,
  title: 1,
});
// Only what the read model reads, per §8.4. Kept in step with
// `ListProjectedField`, which is the type that admits the absence.
const LIST_FIELDS = '-description -rules -adminNote -referralPolicy -prizePool.breakdown';
const CLOSED_STATUSES: readonly LifecycleStatus[] = Object.freeze([
  LIFECYCLE_STATUS.REGISTRATION_CLOSED,
  LIFECYCLE_STATUS.LIVE,
  LIFECYCLE_STATUS.COMPLETED,
  LIFECYCLE_STATUS.RESULTS_PUBLISHED,
  LIFECYCLE_STATUS.CANCELLED_INSUFFICIENT_PARTICIPANTS,
]);
const BLOCKED_RELATIONSHIPS: readonly UserRelationship[] = Object.freeze([
  USER_RELATIONSHIP.REGISTERED,
  USER_RELATIONSHIP.WAITLISTED,
]);
const RELATIONSHIP_BY_STATUS: Readonly<Record<string, UserRelationship>> = Object.freeze({
  [PARTICIPATION_STATUS.REGISTERED]: USER_RELATIONSHIP.REGISTERED,
  [PARTICIPATION_STATUS.CANCELLED]: USER_RELATIONSHIP.CANCELLED,
  [PARTICIPATION_STATUS.WAITLISTED]: USER_RELATIONSHIP.WAITLISTED,
});

// Only what the read model reads, per §8.4.
const PARTICIPATION_FIELDS =
  'status registeredAt cancelledAt slotNumber finalEntryFee appliedReferralCode';

// The fields of a participation the read model actually depends on. Narrowing
// the dependency this way means a projected query result and a full document
// are both acceptable, and adding a field the read model does not use is visible
// as an unused projection rather than as a silent coupling.
export type ParticipationSnapshot = Pick<
  ParticipationStatusSource & {
    registeredAt: Date;
    cancelledAt?: Date | null;
    slotNumber?: number | null;
    finalEntryFee: number;
    appliedReferralCode?: string | null;
  },
  'status' | 'registeredAt' | 'cancelledAt' | 'slotNumber' | 'finalEntryFee' | 'appliedReferralCode'
>;

export interface UserState {
  relationship: UserRelationship;
  canRegister: boolean;
  reasonIfNotAllowed: ErrorCode | null;
  canCancel: boolean;
  reasonIfCancelNotAllowed: ErrorCode | null;
  registeredAt: Date | null;
  slotNumber: number | null;
  referralCode: string | null;
}

interface CompetitionDerived {
  lifecycleStatus: LifecycleStatus;
  isRegistrationOpen: boolean;
}

// The whole fields the list projection strips. `LIST_FIELDS` is the runtime half
// of this pair: adding a name here without adding it there makes the type
// stricter than the query, which is the safe direction to be wrong in.
type ListProjectedField = 'description' | 'rules' | 'adminNote' | 'referralPolicy' | 'prizePool';

// A list item is deliberately not the detail snapshot. `prizePool` survives the
// projection while its `breakdown` does not, so it is re-spelled rather than
// dropped whole. Reading a projected field off a list item is a compile error
// here instead of a field the type promised and the query never sent.
export type CompetitionSummary = Omit<CompetitionSnapshot, ListProjectedField> & {
  prizePool?: Omit<NonNullable<CompetitionSnapshot['prizePool']>, 'breakdown'> | null;
} & CompetitionDerived;

// The detail endpoint selects nothing away, so it carries the whole snapshot.
export type CompetitionDetails = CompetitionSnapshot &
  CompetitionDerived & {
    serverTime: string;
    userState: UserState | null;
  };

// The only user field the read model reads is the dance form; `_id` is carried
// solely so `deriveReferralCode` has something stable to derive from. It is named
// explicitly for the same reason as `LoadedUser` below: the inferred attribute
// type does not carry it.
type DetailUser = Pick<UserAttrs, 'primaryDanceForm'> & Pick<UserDoc, '_id'>;

export interface CompetitionDetailsInput {
  competition: CompetitionDoc;
  // Only the dance form is read, so only it is required. `registrationService`
  // has already loaded a full user by this point and satisfies the same shape.
  user: DetailUser | null;
  participation: ParticipationSnapshot | null;
  now: Date;
}

export interface CompetitionListFilters {
  danceForm?: DanceForm;
  tag?: string;
  search?: string;
  adminStatus?: AdminStatus;
  registrationOpenOnly?: boolean;
  upcomingOnly?: boolean;
  // Deliberately loose. The service is callable without going through HTTP, so
  // it matches `sortBy` against its own allow-list rather than trusting a type.
  sortBy?: string;
  sortOrder?: string;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CompetitionListResult {
  items: CompetitionSummary[];
  pagination: PaginationResult;
}

interface EligibilityInput {
  competition: Pick<CompetitionAttrs, 'danceForm'>;
  relationship: UserRelationship;
  primaryDanceForm: UserAttrs['primaryDanceForm'];
  lifecycleStatus: LifecycleStatus;
  spotsRemaining: number;
}

interface EligibilityResult {
  canRegister: boolean;
  reasonIfNotAllowed: ErrorCode | null;
}

interface CancellationInput {
  relationship: UserRelationship;
  cancellationClosesAt: Date | null | undefined;
  now: Date;
}

interface CancellationResult {
  canCancel: boolean;
  reasonIfCancelNotAllowed: ErrorCode | null;
}

interface UserStateInput {
  competition: CompetitionDoc;
  user: DetailUser;
  participation: ParticipationSnapshot | null;
  relationship: UserRelationship;
  lifecycleStatus: LifecycleStatus;
  spotsRemaining: number;
  now: Date;
}

// Mongoose's return type for `toObject()` omits virtuals even when the schema
// asks for them, so the two are named explicitly. The value is the same object
// either way; this only states it in a form the compiler can check.
function toSnapshot(competition: CompetitionDoc): CompetitionSnapshot {
  return {
    ...competition.toObject(),
    spotsRemaining: competition.spotsRemaining,
    isFull: competition.isFull,
  };
}

export function deriveUserRelationship(
  participation: ParticipationStatusSource | null,
): UserRelationship {
  if (!participation) {
    return USER_RELATIONSHIP.NOT_REGISTERED;
  }
  return RELATIONSHIP_BY_STATUS[participation.status] ?? USER_RELATIONSHIP.NOT_REGISTERED;
}

// Competition-level truth, identical for every visitor: the client uses it to
// decide whether to draw a live Register button before it knows who is asking.
function isRegistrationOpenFor(
  lifecycleStatus: LifecycleStatus,
  spotsRemaining: number,
): boolean {
  return lifecycleStatus === LIFECYCLE_STATUS.REGISTRATION_OPEN && spotsRemaining > 0;
}

// Precedence, and the reason it is in this order: competition-level blocks are
// reported before user-level ones, so someone who cannot register because the
// event is full is told that, rather than being told they are already
// registered, which is equally true and equally impossible for them to fix.
function deriveUserEligibility(input: EligibilityInput): EligibilityResult {
  const { competition, relationship, primaryDanceForm, lifecycleStatus, spotsRemaining } = input;

  if (lifecycleStatus === LIFECYCLE_STATUS.CANCELLED) {
    return { canRegister: false, reasonIfNotAllowed: ERROR_CODES.COMPETITION_CANCELLED };
  }
  if (lifecycleStatus === LIFECYCLE_STATUS.UPCOMING) {
    return { canRegister: false, reasonIfNotAllowed: ERROR_CODES.REGISTRATION_NOT_OPEN };
  }
  if (CLOSED_STATUSES.includes(lifecycleStatus)) {
    return { canRegister: false, reasonIfNotAllowed: ERROR_CODES.REGISTRATION_CLOSED };
  }
  if (spotsRemaining <= 0) {
    return { canRegister: false, reasonIfNotAllowed: ERROR_CODES.COMPETITION_FULL };
  }
  if (BLOCKED_RELATIONSHIPS.includes(relationship)) {
    return { canRegister: false, reasonIfNotAllowed: ERROR_CODES.ALREADY_REGISTERED };
  }
  if (primaryDanceForm !== competition.danceForm) {
    return { canRegister: false, reasonIfNotAllowed: ERROR_CODES.DANCE_FORM_MISMATCH };
  }
  return { canRegister: true, reasonIfNotAllowed: null };
}

function deriveCancellationEligibility(input: CancellationInput): CancellationResult {
  const { relationship, cancellationClosesAt, now } = input;
  if (relationship !== USER_RELATIONSHIP.REGISTERED) {
    return { canCancel: false, reasonIfCancelNotAllowed: ERROR_CODES.NOT_REGISTERED };
  }
  if (cancellationClosesAt && now > cancellationClosesAt) {
    return { canCancel: false, reasonIfCancelNotAllowed: ERROR_CODES.CANCELLATION_NOT_ALLOWED };
  }
  return { canCancel: true, reasonIfCancelNotAllowed: null };
}

const DEFAULT_REFERRAL_PREFIX = 'REF';
const REFERRAL_CODE_SUFFIX_LENGTH = 6;

// Nothing in the database mints referral codes, so one is derived from the user
// id. It is deterministic, which is the property that matters: the same dancer
// gets the same code on every read, so a link shared in week one still resolves
// in week two without a lookup table.
function deriveReferralCode(competition: CompetitionDoc, user: DetailUser): string {
  const prefix = competition.referralPolicy.codePrefix ?? DEFAULT_REFERRAL_PREFIX;
  const suffix = String(user._id).slice(-REFERRAL_CODE_SUFFIX_LENGTH).toUpperCase();
  return `${prefix}-${suffix}`;
}

function buildUserState(input: UserStateInput): UserState {
  const { competition, user, participation, relationship, lifecycleStatus, spotsRemaining, now } =
    input;

  const eligibility = deriveUserEligibility({
    competition,
    relationship,
    primaryDanceForm: user.primaryDanceForm,
    lifecycleStatus,
    spotsRemaining,
  });
  const cancellation = deriveCancellationEligibility({
    relationship,
    cancellationClosesAt: competition.cancellationClosesAt,
    now,
  });

  return {
    relationship,
    canRegister: eligibility.canRegister,
    reasonIfNotAllowed: eligibility.reasonIfNotAllowed,
    canCancel: cancellation.canCancel,
    reasonIfCancelNotAllowed: cancellation.reasonIfCancelNotAllowed,
    registeredAt: participation ? participation.registeredAt : null,
    slotNumber: participation ? (participation.slotNumber ?? null) : null,
    referralCode: deriveReferralCode(competition, user),
  };
}

export function buildCompetitionDetails(input: CompetitionDetailsInput): CompetitionDetails {
  const { competition, user, participation, now } = input;
  const snapshot = toSnapshot(competition);
  const lifecycleStatus = deriveLifecycleStatus(competition, now);
  const relationship = deriveUserRelationship(participation);

  return {
    ...snapshot,
    lifecycleStatus,
    isRegistrationOpen: isRegistrationOpenFor(lifecycleStatus, snapshot.spotsRemaining),
    serverTime: now.toISOString(),
    userState: user
      ? buildUserState({
          competition,
          user,
          participation,
          relationship,
          lifecycleStatus,
          spotsRemaining: snapshot.spotsRemaining,
          now,
        })
      : null,
  };
}

// The list is projected (§8.4) and carries no userState: per-item user state
// would need one participation query per row, and the client asks for details
// for the competition it actually renders.
function buildCompetitionSummary(competition: CompetitionDoc, now: Date): CompetitionSummary {
  const snapshot = toSnapshot(competition);
  const lifecycleStatus = deriveLifecycleStatus(competition, now);
  return {
    ...snapshot,
    lifecycleStatus,
    isRegistrationOpen: isRegistrationOpenFor(lifecycleStatus, snapshot.spotsRemaining),
  };
}

async function loadCompetition(id: string): Promise<CompetitionDoc> {
  if (!isValidObjectId(id)) {
    throw AppError.fromCode(ERROR_CODES.INVALID_ID, 'Competition id is not a valid ObjectId.');
  }
  const competition = await Competition.findById(id);
  if (!competition) {
    throw AppError.fromCode(ERROR_CODES.COMPETITION_NOT_FOUND, 'Competition not found.');
  }
  return competition;
}

// Annotated as the two fields the caller may rely on, because `.select()` is not
// reflected in Mongoose's types: the runtime document really is narrower than
// `UserDoc`, and saying so is what stops a later caller reading `user.email`
// from a query that never selected it. `_id` comes from `UserDoc` because the
// inferred attribute type does not carry it.
type LoadedUser = Pick<UserDoc, '_id'> & Pick<UserAttrs, 'primaryDanceForm'>;

async function loadUser(userId: string): Promise<LoadedUser> {
  if (!isValidObjectId(userId)) {
    throw AppError.fromCode(ERROR_CODES.INVALID_ID, 'User id is not a valid ObjectId.');
  }
  const user = await User.findById(userId).select('primaryDanceForm');
  if (!user) {
    throw AppError.fromCode(ERROR_CODES.USER_NOT_FOUND, 'User not found.');
  }
  return user;
}

// A participation can be cancelled and re-registered, so a dancer can hold more
// than one row for the same competition. The newest row is the current truth.
async function loadParticipation(
  competitionId: CompetitionDoc['_id'],
  userId: LoadedUser['_id'],
): Promise<ParticipationSnapshot | null> {
  const participation = await Participation.findOne({ competitionId, userId })
    // `_id` breaks the tie on purpose. A cancel and a re-register inside the same
    // millisecond give two rows an identical `registeredAt`, and a sort on that
    // key alone leaves MongoDB free to return either one — so the relationship
    // shown to the dancer would depend on insertion order. ObjectIds increase
    // within a second, so the newest row always wins.
    .sort({ registeredAt: -1, _id: -1 })
    .select(PARTICIPATION_FIELDS);
  // The projection is a string Mongoose cannot narrow the result by, so the
  // guarantee is stated by the return type instead. Every field the snapshot
  // names is in PARTICIPATION_FIELDS.
  return participation as ParticipationSnapshot | null;
}

export async function getCompetitionDetails(
  id: string,
  userId?: string,
): Promise<CompetitionDetails> {
  const competition = await loadCompetition(id);
  const user = userId ? await loadUser(userId) : null;
  const participation = user ? await loadParticipation(competition._id, user._id) : null;

  return buildCompetitionDetails({ competition, user, participation, now: nowUtc() });
}

function toPositiveInt(value: number | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function normalizePagination(pagination: PaginationInput): { page: number; limit: number } {
  return {
    page: toPositiveInt(pagination.page, DEFAULT_PAGE),
    limit: Math.min(toPositiveInt(pagination.limit, DEFAULT_LIMIT), MAX_LIMIT),
  };
}

// sortBy is matched against an allow-list rather than interpolated, so a
// caller cannot sort by a field that was never meant to be sortable.
function buildListSort(filters: CompetitionListFilters): Record<string, SortOrder> {
  const sortBy = Object.hasOwn(SORT_FIELDS, filters.sortBy ?? '') ? filters.sortBy : DEFAULT_SORT_FIELD;
  return { [sortBy as string]: filters.sortOrder === 'desc' ? -1 : 1 };
}

function buildListFilter(
  filters: CompetitionListFilters,
  now: Date,
): QueryFilter<CompetitionAttrs> {
  const filter: QueryFilter<CompetitionAttrs> = {
    adminStatus: filters.adminStatus ?? ADMIN_STATUS.NONE,
  };

  if (filters.danceForm) {
    filter.danceForm = filters.danceForm;
  }
  if (filters.tag) {
    filter.tags = filters.tag;
  }
  if (filters.search) {
    // Anchored, escaped and length-capped: a prefix match can use the slug and
    // title indexes, where an unanchored one could not (§8.4).
    const pattern = filters.search
      .trim()
      .slice(0, MAX_SEARCH_LENGTH)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { slug: { $regex: `^${pattern}`, $options: 'i' } },
      { title: { $regex: `^${pattern}`, $options: 'i' } },
    ];
  }
  if (filters.registrationOpenOnly) {
    // Same bounds as the reservation filter in registrationService, inclusive at
    // both ends, so a competition this filter calls open is one the register
    // endpoint agrees is open. The lifecycle status is *not* reused here:
    // deriving it would mean a `$or` of eight states, which cannot use the
    // registration-window indexes.
    filter.registrationOpensAt = { $lte: now };
    filter.registrationClosesAt = { $gte: now };
    // Capacity is a comparison between two fields of the same document, so it
    // cannot be written with a plain operator. Bracket access because `$expr` is
    // an operator key with no dedicated field on Mongoose's filter type.
    filter['$expr'] = { $lt: ['$currentParticipantCount', '$maxParticipants'] };
  }
  if (filters.upcomingOnly) {
    filter.startsAt = { $gte: now };
  }

  return filter;
}

export async function getCompetitionList(
  filters: CompetitionListFilters = {},
  pagination: PaginationInput = {},
): Promise<CompetitionListResult> {
  const now = nowUtc();
  const { page, limit } = normalizePagination(pagination);
  const filter = buildListFilter(filters, now);

  const [competitions, total] = await Promise.all([
    Competition.find(filter)
      .select(LIST_FIELDS)
      .sort(buildListSort(filters))
      .skip((page - 1) * limit)
      .limit(limit),
    Competition.countDocuments(filter),
  ]);

  return {
    items: competitions.map((competition) => buildCompetitionSummary(competition, now)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
