import type { Request } from 'express';
import { isValidObjectId } from 'mongoose';

import { config } from '../config/env';
import { User } from '../models/User';
import type { RequestUser } from '../types/express';
import { AppError, ERROR_CODES } from '../utils/errors';
import { asyncHandler } from './asyncHandler';

const HEADER_AUTH_MODE = 'header';
const USER_ID_HEADER = 'x-user-id';
// Enough to render a header and to check a dance form. Email and phone are left
// out on purpose: no controller reads them, and the smaller the object attached
// to every request, the less there is to leak by accident.
const USER_FIELDS = 'name primaryDanceForm role';

function assertSupportedAuthMode(): void {
  if (config.authMode !== HEADER_AUTH_MODE) {
    // A deployment misconfiguration, not a client mistake, so it is not a 401:
    // failing loudly beats silently authenticating nobody, or everybody.
    throw AppError.fromCode(
      ERROR_CODES.INTERNAL_ERROR,
      'The configured AUTH_MODE is not implemented.',
    );
  }
}

function readUserIdHeader(req: Request, required: boolean): string | null {
  const userId = req.get(USER_ID_HEADER);

  if (userId === undefined || userId === '') {
    if (required) {
      throw AppError.fromCode(ERROR_CODES.UNAUTHORIZED, 'Authentication is required.');
    }
    return null;
  }
  // A malformed header is UNAUTHORIZED, not INVALID_ID: the caller is not who
  // they claim to be, which is a statement about credentials rather than about
  // the shape of a path parameter.
  if (!isValidObjectId(userId)) {
    throw AppError.fromCode(
      ERROR_CODES.UNAUTHORIZED,
      `The ${USER_ID_HEADER} header is not a valid id.`,
    );
  }
  return userId;
}

async function loadRequestUser(userId: string): Promise<RequestUser> {
  const user = await User.findById(userId).select(USER_FIELDS);
  if (!user) {
    // 401 rather than 404: a 404 would confirm that the id is well-formed and
    // simply does not exist, which is a directory of accounts.
    throw AppError.fromCode(ERROR_CODES.UNAUTHORIZED, 'Authentication is required.');
  }
  return {
    id: user._id.toString(),
    name: user.name,
    primaryDanceForm: user.primaryDanceForm,
    role: user.role,
  };
}

async function identify(req: Request, required: boolean): Promise<RequestUser | null> {
  assertSupportedAuthMode();
  const userId = readUserIdHeader(req, required);
  if (userId === null) {
    return null;
  }
  return loadRequestUser(userId);
}

export const authenticate = asyncHandler(async function identifyCaller(req, res, next) {
  req.user = await identify(req, true);
  next();
});

// For reads that are public but richer once signed in: a missing header means
// "read anonymously", while a header that is present and wrong is still a 401,
// because the caller clearly meant to authenticate and silently degrading to
// anonymous would show them a page with no way to tell why.
export const optionalAuthenticate = asyncHandler(async function identifyCallerIfPresent(
  req,
  res,
  next,
) {
  req.user = await identify(req, false);
  next();
});
