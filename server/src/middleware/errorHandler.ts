import type { ErrorRequestHandler, Request } from 'express';

import { AppError, ERROR_CODES, isAppError } from '../utils/errors';

// §4.2 makes this the only place a failure is turned into a response. The
// `next` argument is unused but its arity is what tells Express this is an
// error handler rather than ordinary middleware, so it has to stay.
export const errorHandler: ErrorRequestHandler = function handleError(
  err: unknown,
  req: Request,
  res,
  next,
): void {
  if (res.headersSent) {
    // The response is already on the wire; anything written now would corrupt
    // it, and the connection is the only thing left to signal on.
    next(err);
    return;
  }

  const appError = toAppError(err);

  if (appError.httpStatus >= 500) {
    // req.path, not req.originalUrl: a query string can carry anything a client
    // sent, including a referral code, and §16 keeps PII out of logs.
    console.error(`[error] ${req.method} ${req.path} -> ${appError.httpStatus}`, err);
  }

  res.status(appError.httpStatus).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  });
};

// A 400 the client can act on, for the two ways express.json() fails before any
// of our own middleware runs. Anything not listed here is treated as unexpected,
// because guessing at its cause is how an internal message reaches a client.
const BODY_PARSER_ERRORS: Readonly<Record<string, string>> = Object.freeze({
  'entity.parse.failed': 'Request body is not valid JSON.',
  'entity.too.large': 'Request body is too large.',
});

interface MongooseValidationError {
  name: 'ValidationError';
  errors: Record<string, { kind?: string; message: string }>;
}

interface MongoDuplicateError {
  code: number;
}

// Narrowing guards rather than casts, so a branch that assumes one of these
// shapes has to prove it before it reads a field.
function isValidationError(value: unknown): value is MongooseValidationError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    value.name === 'ValidationError' &&
    'errors' in value
  );
}

function hasName(value: unknown, name: string): boolean {
  return typeof value === 'object' && value !== null && 'name' in value && value.name === name;
}

function hasType(value: unknown): value is { type: string } {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function isDuplicateKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('code' in value)) {
    return false;
  }
  const candidate: Partial<MongoDuplicateError> = value as Partial<MongoDuplicateError>;
  return candidate.code === 11000;
}

function fromMongooseValidationError(err: MongooseValidationError): AppError {
  const issues = Object.entries(err.errors).map(([path, issue]) => ({
    source: 'body',
    path,
    code: issue.kind ?? 'invalid_value',
    message: issue.message,
  }));
  return AppError.fromCode(ERROR_CODES.VALIDATION_ERROR, 'Request failed validation.', {
    issues,
  });
}

// §12.3: no raw Mongoose error, no stack trace, no internal message. Every
// branch either maps to a code or collapses into a generic 500.
function toAppError(err: unknown): AppError {
  if (isAppError(err)) {
    return err;
  }
  if (hasType(err)) {
    const message = BODY_PARSER_ERRORS[err.type];
    if (message !== undefined) {
      return AppError.fromCode(ERROR_CODES.VALIDATION_ERROR, message);
    }
  }
  if (isValidationError(err)) {
    return fromMongooseValidationError(err);
  }
  if (hasName(err, 'CastError')) {
    return AppError.fromCode(ERROR_CODES.INVALID_ID, 'An id in the request is malformed.');
  }
  if (isDuplicateKey(err)) {
    // A duplicate that reached here is one no service translated, which happens
    // on any collection outside the register flow. ALREADY_REGISTERED would be
    // a lie about which constraint failed, so the code stays generic.
    return AppError.fromCode(ERROR_CODES.DUPLICATE_RESOURCE, 'That resource already exists.');
  }

  return AppError.fromCode(ERROR_CODES.INTERNAL_ERROR, 'Something went wrong.');
}
