import { LIFECYCLE_STATUS, USER_RELATIONSHIP } from '@/constants/enums';
import { formatCurrency, formatDate, isFreeEntryFee } from '@/lib/formatters';
import type { CompetitionDetails } from '@/types/competition';

/** What the button does when pressed. `null` means the button is inert. */
export type CTAIntent = 'REGISTER' | 'UPLOAD_SUBMISSION' | 'VIEW_RESULTS';

/** `primary` is teal, `neutral` is gray, `danger` is the cancelled red. */
export type CTATone = 'primary' | 'neutral' | 'danger';

export interface CTAState {
  label: string;
  sublabel: string | null;
  tone: CTATone;
  isEnabled: boolean;
  intent: CTAIntent | null;
}

const DISABLED: CTATone = 'neutral';

function entryFeeLabel(competition: CompetitionDetails): string {
  return isFreeEntryFee(competition.entryFee.amount)
    ? 'Free entry'
    : `${formatCurrency(competition.entryFee.amount, competition.entryFee.currency)} entry fee`;
}

function closedNotice(): CTAState {
  return {
    label: 'Registration Closed',
    sublabel: null,
    tone: DISABLED,
    isEnabled: false,
    intent: null,
  };
}

function cancelledNotice(): CTAState {
  return {
    label: 'Competition Cancelled',
    sublabel: null,
    tone: 'danger',
    isEnabled: false,
    intent: null,
  };
}

function insufficientNotice(): CTAState {
  return {
    label: 'Not Enough Participants',
    sublabel: 'Entry fees refunded',
    tone: DISABLED,
    isEnabled: false,
    intent: null,
  };
}

function resultsNotice(): CTAState {
  return {
    label: 'View Results',
    sublabel: null,
    tone: 'primary',
    isEnabled: true,
    intent: 'VIEW_RESULTS',
  };
}

/**
 * The participant branch. A registered user sees a different button from a
 * visitor for the same competition, so this is split out rather than interleaved:
 * each `switch` then covers every lifecycle value exactly once and its `never`
 * default is genuinely reachable.
 */
function deriveForRegistered(competition: CompetitionDetails): CTAState {
  switch (competition.lifecycleStatus) {
    case LIFECYCLE_STATUS.UPCOMING:
    case LIFECYCLE_STATUS.REGISTRATION_OPEN:
      // The window is still open, but the seat is already held — pressing through
      // to a mutation would earn a 409 for a state the user already achieved.
      return {
        label: 'Registered ✓',
        sublabel: 'You are in',
        tone: DISABLED,
        isEnabled: false,
        intent: null,
      };
    case LIFECYCLE_STATUS.REGISTRATION_CLOSED:
      return {
        label: 'Registered ✓',
        sublabel: 'Wait for submission',
        tone: DISABLED,
        isEnabled: false,
        intent: null,
      };
    case LIFECYCLE_STATUS.LIVE:
      return {
        label: 'Upload Submission',
        sublabel: 'Registered',
        tone: 'primary',
        isEnabled: true,
        intent: 'UPLOAD_SUBMISSION',
      };
    case LIFECYCLE_STATUS.COMPLETED:
    case LIFECYCLE_STATUS.RESULTS_PUBLISHED:
      return resultsNotice();
    case LIFECYCLE_STATUS.CANCELLED:
      return cancelledNotice();
    case LIFECYCLE_STATUS.CANCELLED_INSUFFICIENT_PARTICIPANTS:
      return insufficientNotice();
    default: {
      const exhaustive: never = competition.lifecycleStatus;
      return exhaustive;
    }
  }
}

/** The visitor branch: `NOT_REGISTERED`, and `CANCELLED` who may register again. */
function deriveForVisitor(competition: CompetitionDetails): CTAState {
  const isFull = competition.spotsRemaining <= 0;

  switch (competition.lifecycleStatus) {
    case LIFECYCLE_STATUS.UPCOMING:
      return {
        label: `Registration Opens ${formatDate(competition.registrationOpensAt)}`,
        sublabel: 'Mark your calendar',
        tone: DISABLED,
        isEnabled: false,
        intent: null,
      };
    case LIFECYCLE_STATUS.REGISTRATION_OPEN:
      if (isFull) {
        return {
          label: 'Competition Full',
          sublabel: 'Registration closed',
          tone: DISABLED,
          isEnabled: false,
          intent: null,
        };
      }
      return {
        label: 'Register Now',
        sublabel: entryFeeLabel(competition),
        tone: 'primary',
        isEnabled: true,
        intent: 'REGISTER',
      };
    case LIFECYCLE_STATUS.REGISTRATION_CLOSED:
      return closedNotice();
    case LIFECYCLE_STATUS.LIVE:
      return {
        label: 'Competition Live',
        sublabel: 'Watch out for results',
        tone: DISABLED,
        isEnabled: false,
        intent: null,
      };
    case LIFECYCLE_STATUS.COMPLETED:
    case LIFECYCLE_STATUS.RESULTS_PUBLISHED:
      return resultsNotice();
    case LIFECYCLE_STATUS.CANCELLED:
      return cancelledNotice();
    case LIFECYCLE_STATUS.CANCELLED_INSUFFICIENT_PARTICIPANTS:
      return insufficientNotice();
    default: {
      const exhaustive: never = competition.lifecycleStatus;
      return exhaustive;
    }
  }
}

/**
 * The single source of truth for the sticky CTA (AGENTS.md §8). Both switches end
 * in `never`, so a new `LifecycleStatus` or `UserRelationship` on the server is a
 * compile error here rather than a button that falls through to its last branch.
 *
 * `submissionOpen` is not served by the API. It maps to `LIVE`, the server's own
 * state for "between startsAt and endsAt" and the nearest thing to a submission
 * window the backend actually states. See DECISIONS.md.
 */
export function deriveCTAState(competition: CompetitionDetails): CTAState {
  const relationship = competition.userState?.relationship ?? USER_RELATIONSHIP.NOT_REGISTERED;

  switch (relationship) {
    case USER_RELATIONSHIP.REGISTERED:
      return deriveForRegistered(competition);
    case USER_RELATIONSHIP.NOT_REGISTERED:
    case USER_RELATIONSHIP.CANCELLED:
      return deriveForVisitor(competition);
    case USER_RELATIONSHIP.WAITLISTED:
      return {
        label: 'On Waitlist',
        sublabel: 'No spots left',
        tone: DISABLED,
        isEnabled: false,
        intent: null,
      };
    default: {
      const exhaustive: never = relationship;
      return exhaustive;
    }
  }
}
