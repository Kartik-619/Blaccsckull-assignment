import type { DanceForm, UserRole } from '../constants/enums';

// The only things a request carries beyond Express's own fields. Both are
// attached by a named middleware and are typed here so that `req.user` and
// `req.validated` are as real to the compiler as `req.params` is.
export interface RequestUser {
  id: string;
  name: string;
  primaryDanceForm: DanceForm;
  role: UserRole;
}

// Parsed request sources, each holding the output of the schema the route
// validated it with. `unknown` rather than `any`: the middleware cannot know
// which schema a route chose, so a controller has to name the type it expects.
export interface ValidatedRequest {
  params: unknown;
  query: unknown;
  body: unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RequestUser | null;
      validated: ValidatedRequest;
    }
  }
}
