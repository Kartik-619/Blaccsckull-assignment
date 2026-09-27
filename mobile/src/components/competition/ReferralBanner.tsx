import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { COLORS } from '@/lib/colors';
import { DEV_USER_ID } from '@/lib/api';
import { formatCurrency } from '@/lib/formatters';
import { DISCOUNT_TYPE } from '@/constants/enums';
import type { CompetitionDetails, ReferralPolicy } from '@/types/competition';

export interface ReferralBannerProps {
  competition: CompetitionDetails;
}

const REFERRAL_BASE_URL = 'https://feedants.com/r/';
const TITLE = 'Refer & Earn more discount';
const COPY_LABEL = 'Copy Link';
const REFER_NOW_LABEL = 'Refer Now';
const COPIED_TOAST = 'Referral link copied';

/**
 * The API mints no per-user referral code — `referralPolicy.codePrefix` validates
 * one but nothing issues them — so the code in the URL falls back to the demo user
 * id. The link is well-formed and copyable but will not resolve until the backend
 * grows a referral-code collection. See DECISIONS.md.
 */
export function buildReferralUrl(competition: CompetitionDetails): string {
  const code = competition.userState?.referralCode ?? DEV_USER_ID;
  return `${REFERRAL_BASE_URL}${code}`;
}

/**
 * The server models referral as a discount the *referrer* applies to their own
 * entry fee, not a reward paid for a signup, so there is no `rewardAmount` to
 * show. The line states the real policy instead of inventing a payout.
 */
function describeOffer(policy: ReferralPolicy): string | null {
  if (!policy.enabled || policy.discountValue <= 0) {
    return null;
  }
  return policy.discountType === DISCOUNT_TYPE.PERCENTAGE
    ? `Get ${policy.discountValue}% off your entry fee`
    : `Get ${formatCurrency(policy.discountValue, 'INR')} off your entry fee`;
}

/** Registered participants only: a referral code is worth nothing without a seat. */
export default function ReferralBanner({ competition }: ReferralBannerProps) {
  const { userState, referralPolicy } = competition;

  if (userState?.relationship !== 'REGISTERED' || !referralPolicy.enabled) {
    return null;
  }

  const referralUrl = buildReferralUrl(competition);
  const offer = describeOffer(referralPolicy);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(referralUrl);
    Toast.show({ type: 'success', text1: COPIED_TOAST });
  };

  const handleReferNow = () => Alert.alert('Coming soon', 'Referral tracking is not implemented yet.');

  return (
    <View className="gap-3 rounded-card bg-emerald-50 p-4">
      <View className="flex-row items-center gap-3">
        <Ionicons name="megaphone" size={20} color={COLORS.primary} />
        <Text className="flex-1 text-sm font-bold text-gray-900">{TITLE}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={REFER_NOW_LABEL}
          onPress={handleReferNow}
          className="rounded-full bg-brand px-3 py-1.5"
        >
          <Text className="text-xs font-bold text-white">{REFER_NOW_LABEL}</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center gap-2">
        <TextInput
          value={referralUrl}
          editable={false}
          accessibilityLabel="Your referral link"
          className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY_LABEL}
          onPress={handleCopy}
          className="rounded-md border border-gray-200 bg-white px-3 py-2"
        >
          <Text className="text-xs font-semibold text-brand">{COPY_LABEL}</Text>
        </Pressable>
      </View>

      {offer ? <Text className="text-[11px] text-gray-500">{offer}</Text> : null}
    </View>
  );
}
