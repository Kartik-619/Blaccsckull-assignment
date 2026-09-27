import type {
  AdminStatus,
  DiscountType,
  ErrorCode,
  LifecycleStatus,
  UserRelationship,
} from '@/constants/enums';

/**
 * Mirrors the JSON `GET /api/v1/competitions/:id` actually returns — the shape
 * built by `buildCompetitionDetails` in `server/src/services/competitionService.ts`.
 *
 * It is deliberately NOT the shape sketched in the task brief. That sketch listed
 * a `referralCode`, a `rewardAmount`, a `judge` block, a `previousWinners` array
 * and a `certificateProvided` flag, none of which the server stores or returns.
 * Those appear below under their real names, each marked *not yet served*, so the
 * gap is a `?:` a component can branch on rather than an invented field that
 * would read `undefined` forever.
 */

export interface EntryFee {
  amount: number;
  currency: string;
}

export interface PrizeBreakdownEntry {
  position: number;
  amount: number;
  description?: string;
}

export interface PrizePool {
  totalAmount: number;
  currency: string;
  breakdown: PrizeBreakdownEntry[];
}

export interface ReferralPolicy {
  enabled: boolean;
  discountType: DiscountType;
  discountValue: number;
  /** `0` means "no cap" — the server reads a literal zero cap as uncapped. */
  maxDiscountAmount: number;
  validUntil?: string | null;
  codePrefix?: string;
  /**
   * *Not yet served.* The design's "You earn ₹X for every signup" line needs a
   * per-referral reward. The server models referral as a discount on the
   * referrer's own entry fee instead, so there is no reward amount to read. The
   * banner renders the real discount as a substitute; see DECISIONS.md.
   */
  rewardAmount?: number;
}

export interface CompetitionVenue {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface CompetitionUserState {
  relationship: UserRelationship;
  canRegister: boolean;
  /** A code such as `DANCE_FORM_MISMATCH`, not a sentence. */
  reasonIfNotAllowed: ErrorCode | null;
  canCancel: boolean;
  reasonIfCancelNotAllowed: ErrorCode | null;
  registeredAt: string | null;
  slotNumber: number | null;
  /**
   * *Not yet served.* No per-user referral code exists; `referralPolicy.codePrefix`
   * validates a code but nothing mints one. The banner falls back to the user id.
   */
  referralCode?: string;
}

export interface CompetitionJudge {
  name: string;
  title: string;
  experienceYears: number;
  avatarUrl?: string;
  introVideoUrl?: string;
}

export interface PreviousWinner {
  name: string;
  imageUrl?: string;
  position: number;
}

export interface CompetitionDetails {
  _id: string;
  slug: string;
  title: string;
  description: string;
  rules: string[];
  bannerUrl?: string;
  danceForm: string;
  tags: string[];
  organizerId: string;

  registrationOpensAt: string;
  registrationClosesAt: string;
  /** Optional on the schema, and a registered user may cancel while it is absent. */
  cancellationClosesAt?: string | null;
  startsAt: string;
  endsAt: string;
  /** Optional: a competition may have no result date set. */
  resultsAnnouncedAt?: string | null;

  maxParticipants: number;
  minParticipants: number;
  currentParticipantCount: number;
  /** Mongoose virtual: `max(0, maxParticipants - currentParticipantCount)`. */
  spotsRemaining: number;
  isFull: boolean;

  entryFee: EntryFee;
  prizePool: PrizePool;
  referralPolicy: ReferralPolicy;
  adminStatus: AdminStatus;
  adminNote?: string;
  venue?: CompetitionVenue;

  createdAt: string;
  updatedAt: string;

  // --- derived by the server, never persisted ---
  lifecycleStatus: LifecycleStatus;
  /** `lifecycleStatus === REGISTRATION_OPEN && spotsRemaining > 0`. */
  isRegistrationOpen: boolean;
  serverTime: string;
  /**
   * `null` for an anonymous caller. The detail route is optional-auth, so this
   * is the normal shape whenever the `x-user-id` header is missing or stale.
   */
  userState: CompetitionUserState | null;

  // --- rendered by the design, not served by the API (see DECISIONS.md) ---
  disclaimer?: string;
  certificateProvided?: boolean;
  judgingParameters?: string;
  eligibility?: string;
  judge?: CompetitionJudge;
  previousWinners?: PreviousWinner[];
  prizeDistributionVideoUrl?: string;
  submissionStartsAt?: string;
  submissionClosesAt?: string;
}
