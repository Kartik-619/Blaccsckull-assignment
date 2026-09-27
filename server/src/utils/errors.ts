// §13 fixes the HTTP status of every error code, so the code is the only thing
// a call site should have to know. One table holds both: a new code that is not
// given a status here would leave the middleware guessing.
//
// Because the union is derived from the table's keys, a call site that
// mistypes a code is a compile error rather than an error with `undefined` as
// its status.

const HTTP_STATUS_BY_CODE = Object.freeze({
  VALIDATION_ERROR: 400,
  INVALID_ID: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  COMPETITION_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  ALREADY_REGISTERED: 409,
  NOT_REGISTERED: 409,
  DUPLICATE_RESOURCE: 409,
  COMPETITION_CANCELLED: 410,
  COMPETITION_FULL: 422,
  REGISTRATION_NOT_OPEN: 422,
  REGISTRATION_CLOSED: 422,
  DANCE_FORM_MISMATCH: 422,
  INSUFFICIENT_PARTICIPANTS: 422,
  CANCELLATION_NOT_ALLOWED: 422,
  REFERRAL_EXPIRED: 422,
  INTERNAL_ERROR: 500,
} as const);

export type ErrorCode = keyof typeof HTTP_STATUS_BY_CODE;

export type ErrorDetails = Record<string, unknown> | readonly unknown[] | string | number;

const ERROR_CODE_LIST = Object.keys(HTTP_STATUS_BY_CODE) as ErrorCode[];

// Derived from the table's keys, so a code cannot exist without a status. The
// assertion is sound rather than a shortcut: both sides are built from the same
// list, so every key is present and every value is that same key.
export const ERROR_CODES = Object.freeze(
  Object.fromEntries(ERROR_CODE_LIST.map((code) => [code, code])) as Record<ErrorCode, ErrorCode>,
);

// `details` is optional and `httpStatus` is positional because §5.5 fixes that
// signature; the common three-argument path is `fromCode`, which looks the
// status up instead of making every call site remember 422.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode, httpStatus: number, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Error.captureStackTrace(this, AppError);
  }

  static fromCode(code: ErrorCode, message: string, details?: ErrorDetails): AppError {
    // An unknown code must not produce an undefined status: an error thrown
    // from the error path has to survive being handled. The fallback is
    // unreachable through the type system, which is the point of the union.
    const httpStatus = HTTP_STATUS_BY_CODE[code] ?? HTTP_STATUS_BY_CODE.INTERNAL_ERROR;
    return new AppError(code, httpStatus, message, details);
  }
}

// Used by the error handler and by tests that assert on a rejection reason, so a
// reason is never read as an arbitrary object just to reach its code.
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
