import { ADMIN_STATUS, LIFECYCLE_STATUS, type LifecycleStatus } from '../constants/enums';
import type { CompetitionAttrs } from '../models/Competition';
import { isWithinWindow } from '../utils/time';

// The minimal shape `deriveLifecycleStatus` reads. Declaring it structurally
// rather than as `CompetitionDoc` is what lets the function be called with a
// hydrated document, a plain object in a test, and a partially selected
// document, without three overloads. The two optional numbers are the ones the
// function defends against with `?? 0`, so the type states that defensiveness
// instead of hiding it behind a non-nullable lie.
export interface LifecycleInput {
  adminStatus: CompetitionAttrs['adminStatus'];
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  startsAt: Date;
  endsAt: Date;
  resultsAnnouncedAt?: Date | null;
  currentParticipantCount?: number;
  minParticipants?: number;
}

// Precedence, highest first. The order is the contract, not an implementation
// detail, so it is spelled out here and in DECISIONS.md:
//   1. adminStatus CANCELLED     -> CANCELLED            (an admin decision outranks the clock)
//   2. results announced         -> RESULTS_PUBLISHED
//   3. past endsAt               -> COMPLETED
//   4. between startsAt and end  -> LIVE
//   5. registration closed and under the minimum -> CANCELLED_INSUFFICIENT_PARTICIPANTS
//   6. registration closed       -> REGISTRATION_CLOSED
//   7. inside the window         -> REGISTRATION_OPEN
//   8. otherwise                 -> UPCOMING
// POSTPONED is deliberately absent: it changes when the event happens, not
// whether the clock has passed its dates, so the timestamps still decide and
// adminStatus travels back to the caller alongside the result.
// Boundaries are inclusive: `now === startsAt` is LIVE and `now ===
// registrationClosesAt` is still REGISTRATION_OPEN.
export function deriveLifecycleStatus(competition: LifecycleInput, now: Date): LifecycleStatus {
  if (competition.adminStatus === ADMIN_STATUS.CANCELLED) {
    return LIFECYCLE_STATUS.CANCELLED;
  }

  if (competition.resultsAnnouncedAt && now > competition.resultsAnnouncedAt) {
    return LIFECYCLE_STATUS.RESULTS_PUBLISHED;
  }

  if (now > competition.endsAt) {
    return LIFECYCLE_STATUS.COMPLETED;
  }

  if (isWithinWindow(now, competition.startsAt, competition.endsAt)) {
    return LIFECYCLE_STATUS.LIVE;
  }

  const isBelowMinimum =
    (competition.currentParticipantCount ?? 0) < (competition.minParticipants ?? 0);

  if (now > competition.registrationClosesAt && isBelowMinimum) {
    return LIFECYCLE_STATUS.CANCELLED_INSUFFICIENT_PARTICIPANTS;
  }

  if (now > competition.registrationClosesAt) {
    return LIFECYCLE_STATUS.REGISTRATION_CLOSED;
  }

  if (isWithinWindow(now, competition.registrationOpensAt, competition.registrationClosesAt)) {
    return LIFECYCLE_STATUS.REGISTRATION_OPEN;
  }

  return LIFECYCLE_STATUS.UPCOMING;
}
