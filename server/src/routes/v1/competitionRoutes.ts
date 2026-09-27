import { Router } from 'express';

import { getCompetition, listCompetitions } from '../../controllers/competitionController';
import { cancel, register } from '../../controllers/registrationController';
import { asyncHandler } from '../../middleware/asyncHandler';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import {
  competitionListQuerySchema,
  competitionParamsSchema,
} from '../../validators/competitionValidator';
import { registrationBodySchema } from '../../validators/registrationValidator';

const router = Router();

// Reads are optional-auth: the read model carries userState when the caller
// identifies itself and is still complete when it does not.
router.get('/', validate({ query: competitionListQuerySchema }), asyncHandler(listCompetitions));

router.get(
  '/:id',
  optionalAuthenticate,
  validate({ params: competitionParamsSchema }),
  asyncHandler(getCompetition),
);

// Writes are hard-auth, and the order is auth before validate on purpose: there
// is no reason to tell an anonymous caller that its body is malformed.
router.post(
  '/:id/register',
  authenticate,
  validate({ params: competitionParamsSchema, body: registrationBodySchema }),
  asyncHandler(register),
);

router.delete(
  '/:id/register',
  authenticate,
  validate({ params: competitionParamsSchema }),
  asyncHandler(cancel),
);

export default router;
