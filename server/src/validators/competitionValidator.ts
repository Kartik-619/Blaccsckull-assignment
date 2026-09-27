import { z } from 'zod';

import { ADMIN_STATUS, ADMIN_STATUS_VALUES, DANCE_FORM_VALUES } from '../constants/enums';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const SORT_FIELDS = ['startsAt', 'createdAt', 'title'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH_LENGTH = 60;

// A query string carries no types: everything arrives as text. `?flag=false` is
// the case that matters — z.coerce.boolean() would read the non-empty string as
// true, so booleans are matched against an explicit enum instead.
//
// The default goes on the enum, before the transform. A default placed after a
// transform is not run through it, so `?` with no flag would yield the string
// 'false', which is truthy: every list request would have been filtered as if
// the flag were on. The inferred type is `boolean`, not `boolean | undefined`,
// so a controller cannot forget that a default exists.
const booleanQuery = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const positiveInt = (fallback: number) => z.coerce.number().int().min(1).default(fallback);

// The allow-list is repeated from the service so that an unknown sort field is a
// 400 naming the bad value, rather than a silently different order. The service
// keeps its own list because it is callable without going through HTTP.
export const competitionParamsSchema = z.strictObject({
  id: z.string().regex(OBJECT_ID, 'Competition id must be a 24 character hex string.'),
});

export const competitionListQuerySchema = z.strictObject({
  page: positiveInt(DEFAULT_PAGE),
  limit: positiveInt(DEFAULT_LIMIT).pipe(z.number().max(MAX_LIMIT)),
  danceForm: z.enum(DANCE_FORM_VALUES).optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  search: z.string().trim().min(1).max(MAX_SEARCH_LENGTH).optional(),
  adminStatus: z.enum(ADMIN_STATUS_VALUES).default(ADMIN_STATUS.NONE),
  registrationOpenOnly: booleanQuery,
  upcomingOnly: booleanQuery,
  sortBy: z.enum(SORT_FIELDS).default(SORT_FIELDS[0]),
  sortOrder: z.enum(SORT_ORDERS).default('asc'),
});

export type CompetitionParams = z.output<typeof competitionParamsSchema>;
export type CompetitionListQuery = z.output<typeof competitionListQuerySchema>;
