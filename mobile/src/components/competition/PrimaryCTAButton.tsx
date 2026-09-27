import { Alert, ActivityIndicator, Pressable, Text, View } from 'react-native';

import { deriveCTAState, type CTATone } from '@/lib/ctaState';
import { COLORS } from '@/lib/colors';
import type { CompetitionDetails } from '@/types/competition';

export interface PrimaryCTAButtonProps {
  competition: CompetitionDetails;
  isLoading: boolean;
  onRegister: () => void;
}

const OUT_OF_SCOPE_TITLE = 'Coming soon';
const SUBMISSION_MESSAGE = 'Uploading a submission is out of scope for this assignment.';
const RESULTS_MESSAGE = 'The results screen is out of scope for this assignment.';

const TONE_BACKGROUND: Record<CTATone, string> = {
  primary: 'bg-brand',
  neutral: 'bg-gray-400',
  danger: 'bg-red-500',
};

const SUBLABEL_COLOR: Record<CTATone, string> = {
  primary: 'text-white/80',
  neutral: 'text-white/90',
  danger: 'text-white/90',
};

/**
 * Owns no mutation (AGENTS.md §4.3): the register call belongs to
 * `useCompetitionDetails`, and this receives the trigger. What it *does* own is
 * the mapping from the derived `intent` to an action, so the route never has to
 * know that "Upload Submission" and "View Results" are both placeholders today.
 */
export default function PrimaryCTAButton({
  competition,
  isLoading,
  onRegister,
}: PrimaryCTAButtonProps) {
  const state = deriveCTAState(competition);

  const handlePress = (): void => {
    switch (state.intent) {
      case 'REGISTER':
        onRegister();
        return;
      case 'UPLOAD_SUBMISSION':
        Alert.alert(OUT_OF_SCOPE_TITLE, SUBMISSION_MESSAGE);
        return;
      case 'VIEW_RESULTS':
        Alert.alert(OUT_OF_SCOPE_TITLE, RESULTS_MESSAGE);
        return;
      default:
        return;
    }
  };

  return (
    <View className="px-4 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state.label}
        accessibilityState={{ disabled: !state.isEnabled, busy: isLoading }}
        disabled={!state.isEnabled}
        onPress={handlePress}
        className={`items-center gap-0.5 rounded-card py-3 ${TONE_BACKGROUND[state.tone]}`}
      >
        {isLoading ? (
          <>
            <ActivityIndicator color={COLORS.card} />
            <Text className="text-[11px] text-white/80">{state.label}</Text>
          </>
        ) : (
          <>
            <Text className="text-base font-bold text-white">{state.label}</Text>
            {state.sublabel ? (
              <Text className={`text-[11px] ${SUBLABEL_COLOR[state.tone]}`}>
                {state.sublabel}
              </Text>
            ) : null}
          </>
        )}
      </Pressable>
    </View>
  );
}
