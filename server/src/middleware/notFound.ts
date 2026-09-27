import type { RequestHandler } from 'express';

import { AppError, ERROR_CODES } from '../utils/errors';

// Registered last, after every route. It goes through next() rather than
// res.status(404) itself because §4.2 makes errorHandler the only formatter, and
// a 404 shaped any other way would be a second error shape for clients to read.
export const notFound: RequestHandler = function handleMissingRoute(req, res, next): void {
  const error = AppError.fromCode(
    ERROR_CODES.NOT_FOUND,
    `No route matches ${req.method} ${req.path}.`,
  );
  next(error);
};
