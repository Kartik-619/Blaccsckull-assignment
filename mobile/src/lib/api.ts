import { create, type AxiosError, isAxiosError } from 'axios';

import type { ApiEnvelope, ErrorCode } from '@/constants/enums';
import { ERROR_CODES } from '@/constants/enums';

const REQUEST_TIMEOUT_MS = 15000;
const USER_ID_HEADER = 'x-user-id';

/**
 * The error every caller sees. `lib/api.ts` is the only place a transport failure
 * is turned into this, so a component never inspects an `AxiosError` and the
 * server's `{ error: { code, message } }` envelope is unwrapped exactly once.
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  status: number;
}

const FALLBACK_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  401: 'Please sign in again.',
  404: 'That competition could not be found.',
  422: 'This action is not allowed right now.',
  500: 'Something went wrong. Please try again.',
});

interface WireErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

function isErrorCode(value: string | undefined): value is ErrorCode {
  return value !== undefined && Object.hasOwn(ERROR_CODES, value);
}

/**
 * Network failures carry no `response`, so there is no code to read and the
 * status is 0. Treating that as an unknown code rather than passing `undefined`
 * through is what keeps the return type honest for every caller.
 */
function toApiError(error: unknown): ApiError {
  if (!isAxiosError(error)) {
    return { code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong.', status: 0 };
  }

  const axiosError = error as AxiosError<WireErrorBody>;
  const status = axiosError.response?.status ?? 0;

  if (!axiosError.response) {
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Cannot reach the server. Check your connection and try again.',
      status,
    };
  }

  const wire = axiosError.response.data?.error;
  const code = isErrorCode(wire?.code) ? wire.code : ERROR_CODES.INTERNAL_ERROR;

  return {
    code,
    message: wire?.message ?? FALLBACK_MESSAGES[status] ?? 'Something went wrong.',
    status,
  };
}

/**
 * `EXPO_PUBLIC_API_BASE_URL` is inlined by Expo at build time, so a missing value
 * cannot be recovered from at runtime. Failing the first request with a legible
 * message beats every screen showing its own error state with no explanation.
 */
const baseURL = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * The auth stub's identity, exported because it is the app's only handle on
 * "who am I" — there is no auth layer in scope. The referral banner needs it to
 * stand in for the per-user referral code the API does not mint; AGENTS.md §15
 * confines env reads to this module, so this is the one place it is read.
 */
export const DEV_USER_ID = process.env.EXPO_PUBLIC_DEV_USER_ID ?? '';

/**
 * Which competition `/` forwards to. Exists for the same reason as `DEV_USER_ID`
 * and lives here for the same reason: §15 confines env reads to this module. The
 * app has exactly one screen, so the index route is a redirect rather than a
 * second screen, and it needs a target to redirect to.
 */
export const DEV_COMPETITION_ID = process.env.EXPO_PUBLIC_DEV_COMPETITION_ID ?? '';

export const api = create({
  baseURL: baseURL ?? '',
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

// Auth stub, per AGENTS.md §7.2. The server treats a *missing* header as
// anonymous and a *malformed* one as 401, so an unset variable degrades to a
// public read rather than a hard failure.
api.interceptors.request.use((config) => {
  if (DEV_USER_ID) {
    config.headers.set(USER_ID_HEADER, DEV_USER_ID);
  }
  return config;
});

// Normalisation only: no branching on which endpoint was called, and no retry or
// logging decision. Those belong to the hooks that own the query.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);

/** Unwraps the `{ data, meta }` envelope every endpoint in `api/v1` returns. */
export function unwrap<T>(envelope: ApiEnvelope<T>): T {
  return envelope.data;
}
