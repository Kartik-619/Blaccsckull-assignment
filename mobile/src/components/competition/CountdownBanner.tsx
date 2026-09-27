import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';
import { formatCountdown, type CountdownParts } from '@/lib/formatters';

export interface CountdownBannerProps {
  parts: CountdownParts;
}

const CLOSES_LABEL = 'Registration closes in';
const HURRY_LABEL = 'Hurry up!';

/**
 * Rendered by the screen only while `lifecycleStatus === REGISTRATION_OPEN`, so
 * this component never has to decide whether the window is open — it is told the
 * remaining time and displays it.
 */
export default function CountdownBanner({ parts }: CountdownBannerProps) {
  return (
    <View className="flex-row items-center justify-between gap-2 rounded-card bg-brand-light px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Ionicons name="hourglass" size={16} color={COLORS.primary} />
        <Text className="text-xs font-medium text-gray-700">{CLOSES_LABEL}</Text>
      </View>

      <Text className="text-sm font-bold text-brand">{formatCountdown(parts)}</Text>

      <View className="flex-row items-center gap-1">
        <Ionicons name="alarm" size={14} color={COLORS.primary} />
        <Text className="text-xs font-bold text-brand">{HURRY_LABEL}</Text>
      </View>
    </View>
  );
}
