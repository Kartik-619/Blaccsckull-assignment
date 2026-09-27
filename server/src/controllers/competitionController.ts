import type { Request, Response } from 'express';

import { validatedParams, validatedQuery } from '../middleware/validate';
import { getCompetitionDetails, getCompetitionList } from '../services/competitionService';
import { sendSuccess } from '../utils/response';
import type {
  CompetitionListQuery,
  CompetitionParams,
} from '../validators/competitionValidator';

// One service call each, and nothing else: §4.3 allows parsing the request,
// calling one service, and shaping the response. No service reads req, so the
// userId that goes in is the one the middleware attached, never one from the
// query string or the body. Both are async and are wrapped in asyncHandler at
// the route, which is what turns a rejection here into a formatted error.
export async function listCompetitions(req: Request, res: Response): Promise<void> {
  const { page, limit, ...filters } = validatedQuery<CompetitionListQuery>(req);
  const result = await getCompetitionList(filters, { page, limit });
  sendSuccess(res, result);
}

export async function getCompetition(req: Request, res: Response): Promise<void> {
  // Optional here: the read model answers for a signed-in dancer and for
  // nobody, and userState is null in the second case.
  const userId = req.user?.id;
  const details = await getCompetitionDetails(
    validatedParams<CompetitionParams>(req).id,
    userId,
  );
  sendSuccess(res, details);
}
