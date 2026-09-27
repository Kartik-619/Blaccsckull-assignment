import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import SectionHeader from '@/components/common/SectionHeader';
import { COLORS } from '@/lib/colors';
import { formatCurrency, formatPositionLabel } from '@/lib/formatters';

export interface RewardsListProps {
  breakdown: { position: number; amount: number }[];
  currency: string;
}

const SUBTITLE = '(All Positions)';
const EMPTY_LABEL = 'No rewards published for this competition.';

/** Trophy for a podium place, star below it — no emoji anywhere (AGENTS.md §13). */
function presentPosition(position: number): { icon: 'trophy' | 'star-outline'; color: string } {
  if (position === 1) {
    return { icon: 'trophy', color: COLORS.medalGold };
  }
  if (position === 2) {
    return { icon: 'trophy', color: COLORS.medalSilver };
  }
  if (position === 3) {
    return { icon: 'trophy', color: COLORS.medalBronze };
  }
  return { icon: 'star-outline', color: COLORS.textLight };
}

export interface RewardRowProps {
  position: number;
  amount: number;
  currency: string;
  /** Alternating tint from the index, so the shading follows rank order not data order. */
  rowBackground: string;
  isLast: boolean;
}

/**
 * One prize row. The border is applied per row rather than through a `last:` variant so
 * the container's `overflow-hidden` clips the final row's background to the radius with
 * no rule left hanging under the curve.
 */
function RewardRow({ position, amount, currency, rowBackground, isLast }: RewardRowProps) {
  const presentation = presentPosition(position);
  const rule = isLast ? '' : 'border-b border-gray-100';

  return (
    
    <View className={`flex-row items-center px-4 py-3 ${rowBackground} ${rule}`}>
      {/* Fixed-width box so every label starts at the same x, whatever the icon's shape. */}
      <View className="w-7 items-center">
        <Ionicons name={presentation.icon} size={20} color={presentation.color} />
      </View>
      <Text className="ml-3 flex-1 text-sm font-medium text-gray-900">
        {formatPositionLabel(position)}
      </Text>
      <Text
        className="text-sm font-bold text-brand"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {formatCurrency(amount, currency)}
      </Text>
    </View>
  );
}

export default function RewardsList({ breakdown, currency }: RewardsListProps) {
  // Rank order is the table's meaning, so it does not depend on the API's array order.
  // Copied before sorting: `breakdown` is the parent's array and must not be mutated.
  const ordered = [...breakdown].sort((a, b) => a.position - b.position);

  return (
    <View className='shadow-sm p-3 bg-white rounded-xl'>
    <View className="gap-3">
      <SectionHeader title="Rewards" subtitle={SUBTITLE} />

      {ordered.length === 0 ? (
        <Text className="text-xs text-gray-400">{EMPTY_LABEL}</Text>
      ) : (
        <View
          className="overflow-hidden rounded-card border border-gray-200 bg-white shadow-sm elevation-2"
        >
          {ordered.map((entry, index) => (
            <RewardRow
              key={entry.position}
              position={entry.position}
              amount={entry.amount}
              currency={currency}
              rowBackground={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
              isLast={index === ordered.length - 1}
            />
          ))}
        </View>
      )}
    </View></View>
  );
}
