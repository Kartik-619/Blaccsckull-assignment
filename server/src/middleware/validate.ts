import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import type { ValidatedRequest } from '../types/express';
import { AppError, ERROR_CODES, type ErrorDetails } from '../utils/errors';

const SOURCES = ['params', 'query', 'body'] as const;

type RequestSource = (typeof SOURCES)[number];

export interface ValidationSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

interface ValidationIssue {
  source: RequestSource;
  path: string;
  code: string;
  message: string;
}

// express.json() leaves req.body undefined when a request arrives with no body
// at all, so an object schema needs something to fail against. params and query
// are always objects from Express, and a missing one is a bug worth seeing.
function readSource(req: Request, source: RequestSource): unknown {
  const value = req[source];
  if (value === undefined && source === 'body') {
    return {};
  }
  return value;
}

function collectIssues(
  source: RequestSource,
  result: { error: z.ZodError },
): ValidationIssue[] {
  return result.error.issues.map((issue) => ({
    source,
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }));
}

// Every source is parsed before anything is recorded, so a request is either
// fully validated or never handed to a controller with half its input replaced.
//
// The parsed values are stored on `req.validated` and NOT written back onto
// `req.params` / `req.query` / `req.body`. Express 5 defines `req.query` as a
// getter, so assigning to it is a silent no-op that leaves the raw strings in
// place — the old version had to redefine the property to work around that. A
// separate, explicitly named slot removes the need for the workaround and makes
// it impossible to read an unvalidated string by accident.
export function validate(schemas: ValidationSchemas): RequestHandler {
  return function validateRequest(req, res, next): void {
    const validated: { [K in RequestSource]?: unknown } = {};
    const issues: ValidationIssue[] = [];

    for (const source of SOURCES) {
      const schema = schemas[source];
      if (!schema) {
        continue;
      }
      const result = schema.safeParse(readSource(req, source));
      if (!result.success) {
        issues.push(...collectIssues(source, result));
        continue;
      }
      validated[source] = result.data;
    }

    if (issues.length > 0) {
      const details: ErrorDetails = { issues };
      const error = AppError.fromCode(
        ERROR_CODES.VALIDATION_ERROR,
        'Request failed validation.',
        details,
      );
      next(error);
      return;
    }

    req.validated = validated as ValidatedRequest;
    next();
  };
}

// The one place the validated output becomes a specific type. The schema named in
// the route is the only thing that can have written this slot, and a route that
// validates `query` with a query schema cannot put a body there, so the type a
// controller asks for is the type the route promised it. Controllers call these
// instead of asserting inline, so there is exactly one boundary cast per source
// and it is greppable.
export function validatedParams<T>(req: Request): T {
  return req.validated.params as T;
}

export function validatedQuery<T>(req: Request): T {
  return req.validated.query as T;
}

export function validatedBody<T>(req: Request): T {
  return req.validated.body as T;
}
