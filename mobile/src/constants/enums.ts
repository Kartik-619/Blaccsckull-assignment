// The enum values the backend accepts, mirrored from `server/src/constants/enums.ts`
// and `server/src/utils/errors.ts`. They are duplicated rather than imported
// because the two are separate deployables with no shared package; a value added
// on one side and not the other is a compile error here, which is the intended
// alarm.

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

export const USER_RELATIONSHIP = Object.freeze({
  NOT_REGISTERED: 'NOT_REGISTERED',
  REGISTERED: 'REGISTERED',
  CANCELLED: 'CANCELLED',
  WAITLISTED: 'WAITLISTED',
} as const);

export type UserRelationship = (typeof USER_RELATIONSHIP)[keyof typeof USER_RELATIONSHIP];

export const ADMIN_STATUS = Object.freeze({
  NONE: 'NONE',
  CANCELLED: 'CANCELLED',
  POSTPONED: 'POSTPONED',
} as const);

export type AdminStatus = (typeof ADMIN_STATUS)[keyof typeof ADMIN_STATUS];

export const DISCOUNT_TYPE = Object.freeze({
  FLAT: 'FLAT',
  PERCENTAGE: 'PERCENTAGE',
} as const);

export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE];

/**
 * `ErrorCode` is the closed set of codes `errorHandler` can emit. `AxiosError`
 * normalisation in `lib/api.ts` narrows to this, so an unrecognised code is a
 * type error rather than a message rendered straight from the wire.
 */
export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_ID: 'INVALID_ID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  COMPETITION_NOT_FOUND: 'COMPETITION_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  NOT_REGISTERED: 'NOT_REGISTERED',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  COMPETITION_CANCELLED: 'COMPETITION_CANCELLED',
  COMPETITION_FULL: 'COMPETITION_FULL',
  REGISTRATION_NOT_OPEN: 'REGISTRATION_NOT_OPEN',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  DANCE_FORM_MISMATCH: 'DANCE_FORM_MISMATCH',
  INSUFFICIENT_PARTICIPANTS: 'INSUFFICIENT_PARTICIPANTS',
  CANCELLATION_NOT_ALLOWED: 'CANCELLATION_NOT_ALLOWED',
  REFERRAL_EXPIRED: 'REFERRAL_EXPIRED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const);

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** `GET /api/v1/competitions/:id` and `POST /:id/register` both return this. */
export interface ApiEnvelope<T> {
  data: T;
  meta: {
    serverTime: string;
  };
}
