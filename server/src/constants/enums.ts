// Mongoose stores enum values verbatim and never complains about an unknown one
// it has not been told about, so a typo here surfaces as a silently different
// value in the database rather than as a validation error. One frozen map per
// concept is the only place a value may be spelled.
//
// The `as const` on each map is what makes the union types below exact: without
// it every value would widen to `string` and `DANCE_FORM` would stop constraining
// anything. `Object.freeze` is still applied so the map cannot be edited at
// runtime, which `as const` alone does not prevent.

export const DANCE_FORMS = Object.freeze({
  BHARATANATYAM: 'BHARATANATYAM',
  KATHAK: 'KATHAK',
  KUCHIPUDI: 'KUCHIPUDI',
  ODISSI: 'ODISSI',
  MOHINIYATTAM: 'MOHINIYATTAM',
  MANIPURI: 'MANIPURI',
  SATTRIYA: 'SATTRIYA',
} as const);

export type DanceForm = (typeof DANCE_FORMS)[keyof typeof DANCE_FORMS];

export const ADMIN_STATUS = Object.freeze({
  NONE: 'NONE',
  CANCELLED: 'CANCELLED',
  POSTPONED: 'POSTPONED',
} as const);

export type AdminStatus = (typeof ADMIN_STATUS)[keyof typeof ADMIN_STATUS];

export const PARTICIPATION_STATUS = Object.freeze({
  REGISTERED: 'REGISTERED',
  CANCELLED: 'CANCELLED',
  WAITLISTED: 'WAITLISTED',
} as const);

export type ParticipationStatus =
  (typeof PARTICIPATION_STATUS)[keyof typeof PARTICIPATION_STATUS];

export const DISCOUNT_TYPE = Object.freeze({
  FLAT: 'FLAT',
  PERCENTAGE: 'PERCENTAGE',
} as const);

export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE];

export const USER_ROLE = Object.freeze({
  USER: 'USER',
  ORGANIZER: 'ORGANIZER',
  ADMIN: 'ADMIN',
} as const);

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

// Derived at read time by `deriveLifecycleStatus` and never persisted, so there
// is no value array for it: nothing validates a stored value against these.
export const LIFECYCLE_STATUS = Object.freeze({
  UPCOMING: 'UPCOMING',
  REGISTRATION_OPEN: 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  LIVE: 'LIVE',
  COMPLETED: 'COMPLETED',
  RESULTS_PUBLISHED: 'RESULTS_PUBLISHED',
  CANCELLED: 'CANCELLED',
  CANCELLED_INSUFFICIENT_PARTICIPANTS: 'CANCELLED_INSUFFICIENT_PARTICIPANTS',
} as const);

export type LifecycleStatus = (typeof LIFECYCLE_STATUS)[keyof typeof LIFECYCLE_STATUS];

// What one user's participation means for one competition. Derived, never
// stored: three of the four are stored statuses and NOT_REGISTERED is the
// absence of a participation row.
export const USER_RELATIONSHIP = Object.freeze({
  NOT_REGISTERED: 'NOT_REGISTERED',
  REGISTERED: 'REGISTERED',
  CANCELLED: 'CANCELLED',
  WAITLISTED: 'WAITLISTED',
} as const);

export type UserRelationship =
  (typeof USER_RELATIONSHIP)[keyof typeof USER_RELATIONSHIP];

// `enum` validators compare against stored values, so they need the value array
// rather than the key map. Derived from the maps, so the two cannot drift. The
// `Object.freeze` result is re-asserted as a readonly tuple-compatible array so
// Mongoose can read the literal union off it instead of widening to `string`.
export const DANCE_FORM_VALUES = Object.freeze(
  Object.values(DANCE_FORMS),
) as readonly DanceForm[];

export const ADMIN_STATUS_VALUES = Object.freeze(
  Object.values(ADMIN_STATUS),
) as readonly AdminStatus[];

export const PARTICIPATION_STATUS_VALUES = Object.freeze(
  Object.values(PARTICIPATION_STATUS),
) as readonly ParticipationStatus[];

export const DISCOUNT_TYPE_VALUES = Object.freeze(
  Object.values(DISCOUNT_TYPE),
) as readonly DiscountType[];

export const USER_ROLE_VALUES = Object.freeze(Object.values(USER_ROLE)) as readonly UserRole[];
