import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';
import { formatCurrency, isFreeEntryFee, toPercentage } from '@/lib/formatters';

export interface StatsRowProps {
  prizePoolAmount: number;
  currency: string;
  entryFeeAmount: number;
  spotsRemaining: number;
  currentParticipantCount: number;
  maxParticipants: number;
}

interface SpotsPresentation {
  label: string;
  color: string;
}

/** The thresholds and colours are fixed by the design; see DECISIONS.md. */
function presentSpots(spotsRemaining: number): SpotsPresentation {
  if (spotsRemaining <= 0) {
    return { label: 'No spots left', color: COLORS.danger };
  }
  if (spotsRemaining <= 5) {
    return { label: `Only ${spotsRemaining} spots left`, color: COLORS.danger };
  }
  if (spotsRemaining <= 20) {
    return { label: `Only ${spotsRemaining} spots left`, color: COLORS.warning };
  }
  return { label: `${spotsRemaining} spots left`, color: COLORS.textGray };
}

/** The three-up money-and-capacity row: prize pool, entry fee, spots remaining. */
export default function StatsRow({
  prizePoolAmount,
  currency,
  entryFeeAmount,
  spotsRemaining,
  currentParticipantCount,
  maxParticipants,
}: StatsRowProps) {
  const spots = presentSpots(spotsRemaining);
  const fillPercentage = toPercentage(currentParticipantCount, maxParticipants);

  return (
    <View className="mt-4 flex-row items-start gap-3">
      <View className="flex-1 gap-1">
        <Text className="text-xs text-gray-500">Prize Pool</Text>
        <Text className="text-lg font-bold text-brand">
          {formatCurrency(prizePoolAmount, currency)}
        </Text>
      </View>

      <View className="flex-1 gap-1">
        <Text className="text-xs text-gray-500">Entry Fee</Text>
        <Text className="text-lg font-bold text-gray-900">
          {isFreeEntryFee(entryFeeAmount) ? 'FREE' : formatCurrency(entryFeeAmount, currency)}
        </Text>
      </View>

      <View className="flex-1 items-end gap-1">
        <View className="flex-row items-center gap-1">
          <Ionicons name="person" size={12} color={spots.color} />
          <Text className="text-xs font-semibold" style={{ color: spots.color }}>
            {spots.label}
          </Text>
        </View>
        <View className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <View
            className="h-full rounded-full bg-brand"
            style={{ width: `${fillPercentage}%` }}
          />
        </View>
        <Text className="text-[10px] text-gray-400">
          {currentParticipantCount} / {maxParticipants} Booked
        </Text>
      </View>
    </View>
  );
}
