import type { RequestHandler } from 'express';

// A rejection inside an async controller is an unhandled rejection and the
// request hangs until the client times out. This is the single place that turns
// one into the next(err) that errorHandler knows how to format, so controllers
// and middleware both funnel through it rather than each rolling their own.
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return function handleAsync(req, res, next): void {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
