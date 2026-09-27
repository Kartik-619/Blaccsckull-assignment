import { z } from 'zod';

const MAX_CODE_LENGTH = 40;

// A referral code is a token, not prose. Allowing any characters would let a
// client put a megabyte of text in a field the service only ever does a prefix
// comparison on, and would make the prefix rule meaningless.
const referralCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_CODE_LENGTH)
  .regex(/^[A-Za-z0-9-]+$/, 'Referral code may contain letters, digits and hyphens.');

// strict, so a client cannot smuggle a userId into the body: the controller
// reads the dancer from req.user, and an unexpected key here is a client bug
// worth reporting rather than a field to silently drop. The `:id` param is not
// here — every route that takes one is a competition route, so it uses
// competitionParamsSchema instead of this file repeating the same shape.
export const registrationBodySchema = z.strictObject({
  referralCode: referralCodeSchema.optional(),
});

export type RegistrationBody = z.output<typeof registrationBodySchema>;
