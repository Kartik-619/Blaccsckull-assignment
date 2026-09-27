import { useLocalSearchParams, router } from 'expo-router';
import { Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ErrorState from '@/components/common/ErrorState';
import AdPlaceholder from '@/components/competition/AdPlaceholder';
import BottomTabBar from '@/components/competition/BottomTabBar';
import CompetitionSkeleton from '@/components/competition/CompetitionSkeleton';
import CountdownBanner from '@/components/competition/CountdownBanner';
import DisclaimerBanner from '@/components/competition/DisclaimerBanner';
import HeaderCard from '@/components/competition/HeaderCard';
import HearFromUsersRow from '@/components/competition/HearFromUsersRow';
import ImportantDatesGrid from '@/components/competition/ImportantDatesGrid';
import InfoRow from '@/components/competition/InfoRow';
import JudgeCard from '@/components/competition/JudgeCard';
import PreviousWinnersCarousel from '@/components/competition/PreviousWinnersCarousel';
import PrimaryCTAButton from '@/components/competition/PrimaryCTAButton';
import ReferralBanner from '@/components/competition/ReferralBanner';
import RewardsList from '@/components/competition/RewardsList';
import TabsSection from '@/components/competition/TabsSection';
import TopBar from '@/components/competition/TopBar';
import { LIFECYCLE_STATUS } from '@/constants/enums';
import { isNotFoundError, useCompetitionDetails } from '@/hooks/useCompetitionDetails';
import { useCountdown } from '@/hooks/useCountdown';

const NOT_FOUND_TITLE = 'Competition not found';
const NOT_FOUND_MESSAGE = 'This competition may have been removed, or the link is incorrect.';
const NOT_FOUND_ACTION = 'Go back';
const ERROR_TITLE = 'Something went wrong';
const RETRY_ACTION = 'Retry';

export default function CompetitionDetailsScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // Expo Router types a catch-all param as possibly an array when a route can
  // repeat a segment. The server takes a single ObjectId, so the first wins.
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { data, isLoading, error, refetch, register } = useCompetitionDetails(id);
  const insets = useSafeAreaInsets();

  const isRegistrationOpen = data?.lifecycleStatus === LIFECYCLE_STATUS.REGISTRATION_OPEN;

  // Called unconditionally: gating a hook on a data field changes the hook order
  // between renders. The hook accepts a null target and idles instead. See
  // useCountdown and DECISIONS.md.
  const countdown = useCountdown(
    isRegistrationOpen ? data.registrationClosesAt : null,
    data?.serverTime ?? null,
    id,
  );

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <TopBar />
        <View className="flex-1 px-4">
          <CompetitionSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  // A missing id never fires a request, so it is a not-found rather than an error.
  if (id === undefined || isNotFoundError(error)) {
    // This screen is normally opened by its path, so the stack often holds nothing
    // to pop and a "Go back" button would only dispatch an unhandled GO_BACK. The
    // web branch is the one documented in TopBar: `router.canGoBack()` throws
    // under `IS_DOM`, and web `router.back()` is already a safe `history.back()`.
    const hasHistory = Platform.OS === 'web' || router.canGoBack();

    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <ErrorState
          title={NOT_FOUND_TITLE}
          message={NOT_FOUND_MESSAGE}
          actionLabel={hasHistory ? NOT_FOUND_ACTION : undefined}
          onAction={hasHistory ? () => router.back() : undefined}
        />
      </SafeAreaView>
    );
  }

  if (error !== null || data === undefined) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <ErrorState
          title={ERROR_TITLE}
          message={error?.message ?? NOT_FOUND_MESSAGE}
          actionLabel={RETRY_ACTION}
          onAction={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <TopBar />

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="gap-3 px-4 pb-4">
            <HeaderCard competition={data} />
            <JudgeCard judge={data.judge} />
            {isRegistrationOpen ? <CountdownBanner parts={countdown} /> : null}
            <ImportantDatesGrid competition={data} />
            <PreviousWinnersCarousel winners={data.previousWinners} />
            <TabsSection competition={data} />
            <RewardsList
              breakdown={data.prizePool.breakdown}
              currency={data.prizePool.currency}
            />
            <DisclaimerBanner disclaimer={data.disclaimer} />
            <InfoRow />
            <ReferralBanner competition={data} />
            <HearFromUsersRow />
            <AdPlaceholder />
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Pinned outside the scroll view, above the home-indicator inset. */}
      <View style={{ paddingBottom: insets.bottom }} className="bg-background">
        <PrimaryCTAButton
          competition={data}
          isLoading={register.isPending}
          onRegister={() => register.mutate()}
        />
        <BottomTabBar />
      </View>
    </View>
  );
}
