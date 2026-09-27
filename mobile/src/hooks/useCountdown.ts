import { useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { competitionQueryKey } from '@/hooks/useCompetitionDetails';
import { splitDuration, type CountdownParts } from '@/lib/formatters';

const TICK_INTERVAL_MS = 1000;

const IDLE: CountdownParts = Object.freeze({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  isExpired: false,
});

type CountdownAction = { type: 'tick'; remainingMs: number };

function countdownReducer(state: CountdownParts, action: CountdownAction): CountdownParts {
  switch (action.type) {
    case 'tick':
      return splitDuration(action.remainingMs);
    default:
      return state;
  }
}

function toMillis(value: string | null): number {
  return value ? new Date(value).getTime() : Number.NaN;
}

/**
 * Counts down to `targetDate` on the *server's* clock.
 *
 * The device clock is never trusted for a lifecycle decision (AGENTS.md §9). A
 * phone whose clock is an hour fast would otherwise keep a registration window
 * looking open long after the server closed it, and the CTA would offer a
 * `POST /register` guaranteed to come back `422`. The countdown is anchored to the
 * `serverTime` the API returned, and the device clock only measures how long has
 * elapsed since that response:
 *
 *     remaining = target − serverNow − elapsed
 *
 * An absolute device offset cancels out of that expression, which is the whole
 * point: a wrong-by-an-hour clock produces the same answer as a correct one. Only
 * the clock's *rate* is trusted, never its reading.
 *
 * The remaining time is reducer state rather than a value derived during render,
 * because reading the clock during render is impure and the React Compiler
 * rejects it. The effect below is a pure subscription: it schedules ticks and
 * never dispatches synchronously in its own body.
 *
 * `targetDate` and `serverTime` are both nullable and this hook is called
 * unconditionally — gating it on a data field would change the hook order between
 * renders, and the banner is rendered off `lifecycleStatus`. `competitionId` is
 * what makes the expiry refetch possible and is optional so the hook stays usable
 * before a route param resolves.
 */
export function useCountdown(
  targetDate: string | null,
  serverTime: string | null,
  competitionId?: string,
): CountdownParts {
  const queryClient = useQueryClient();
  const [parts, dispatch] = useReducer(countdownReducer, IDLE);

  // Latches the expiry refetch so one expired target triggers one invalidation
  // rather than one per tick.
  const hasFiredRef = useRef(false);

  useEffect(() => {
    hasFiredRef.current = false;
  }, [targetDate]);

  useEffect(() => {
    const serverMs = toMillis(serverTime);
    const targetMs = toMillis(targetDate);
    if (!Number.isFinite(serverMs) || !Number.isFinite(targetMs)) {
      return;
    }

    const anchoredAt = Date.now();
    const tick = () =>
      dispatch({ type: 'tick', remainingMs: targetMs - serverMs - (Date.now() - anchoredAt) });

    // A zero-delay task rather than a direct call, so the first value lands
    // without the banner flashing 00d : 00h : 00m : 00s for a second.
    const firstTick = setTimeout(tick, 0);
    const interval = setInterval(tick, TICK_INTERVAL_MS);

    return () => {
      clearTimeout(firstTick);
      clearInterval(interval);
    };
  }, [targetDate, serverTime]);

  // Refetch once the window has closed, so the lifecycle status, the CTA and the
  // spots counter all refresh without the user pulling to refresh.
  useEffect(() => {
    if (targetDate === null || !parts.isExpired || hasFiredRef.current || !competitionId) {
      return;
    }
    hasFiredRef.current = true;
    void queryClient.invalidateQueries({ queryKey: competitionQueryKey(competitionId) });
  }, [targetDate, parts.isExpired, competitionId, queryClient]);

  // No target means there is nothing to count, whatever the last tick computed.
  return targetDate === null || serverTime === null ? IDLE : parts;
}
