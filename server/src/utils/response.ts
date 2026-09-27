import type { Response } from 'express';

import { nowUtc } from './time';

export interface SuccessMeta {
  [key: string]: unknown;
}

export interface SendSuccessOptions {
  status?: number;
  meta?: SuccessMeta;
}

// Errors are not shaped here: §4.2 makes `errorHandler` the only place that
// formats a failure, and a second shaper would be a second shape to keep right.
// `serverTime` goes on every success, not just the time-sensitive ones, because
// deciding which endpoint is time-sensitive is a judgement made once here
// instead of at every controller, and getting it wrong is invisible.
export function sendSuccess<T>(res: Response, data: T, options: SendSuccessOptions = {}): void {
  const { status = 200, meta = {} } = options;
  res.status(status).json({ data, meta: { ...meta, serverTime: nowUtc().toISOString() } });
}
