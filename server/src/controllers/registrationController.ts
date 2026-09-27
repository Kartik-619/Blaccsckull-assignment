import type { Request, Response } from 'express';

import { validatedBody, validatedParams } from '../middleware/validate';
import { cancelRegistration, registerUser } from '../services/registrationService';
import { AppError, ERROR_CODES } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import type { CompetitionParams } from '../validators/competitionValidator';
import type { RegistrationBody } from '../validators/registrationValidator';

function competitionLocation(req: Request): string {
  return `/api/v1/competitions/${validatedParams<CompetitionParams>(req).id}`;
}

// `req.user` is set by `authenticate` on this route, so it is not optional here.
// The compiler cannot see that, so the check is explicit rather than asserted:
// if the route is ever reordered and the auth middleware removed, this fails at
// the first request instead of silently registering nobody. A missing user here
// is a wiring fault, not a client mistake, so it is a 500 and the message is
// aimed at whoever reads the log rather than at the caller.
function authenticatedUserId(req: Request): string {
  const user = req.user;
  if (!user) {
    throw AppError.fromCode(
      ERROR_CODES.INTERNAL_ERROR,
      'Registration route reached without an authenticated user.',
    );
  }
  return user.id;
}

export async function register(req: Request, res: Response): Promise<void> {
  // The dancer comes from req.user, never from the body — which is why the
  // body schema is strict and rejects an unexpected userId.
  const details = await registerUser(
    validatedParams<CompetitionParams>(req).id,
    authenticatedUserId(req),
    validatedBody<RegistrationBody>(req).referralCode,
  );
  // 201 rather than 200: a participation now exists. Location points at the
  // competition, because that is the resource the registration belongs to and
  // the one the response body describes in full.
  res.location(competitionLocation(req));
  sendSuccess(res, details, { status: 201 });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  // 200 and not 204: the body is the competition's fresh state, including the
  // spot that has just come free, and a 204 would throw that away.
  const details = await cancelRegistration(
    validatedParams<CompetitionParams>(req).id,
    authenticatedUserId(req),
  );
  sendSuccess(res, details);
}
