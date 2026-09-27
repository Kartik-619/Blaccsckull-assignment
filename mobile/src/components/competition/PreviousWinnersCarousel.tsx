import { Ionicons } from '@expo/vector-icons';
import { Image, ScrollView, Text, View } from 'react-native';

import SectionHeader from '@/components/common/SectionHeader';
import { COLORS } from '@/lib/colors';
import { formatPositionLabel } from '@/lib/formatters';
import type { PreviousWinner } from '@/types/competition';

export interface PreviousWinnersCarouselProps {
  winners?: PreviousWinner[];
}

const EMPTY_LABEL = 'No past winners yet';

/**
 * `previousWinners` is not served by the API, so the carousel renders its empty
 * state until the field exists. Keeping the header and the empty message means
 * the section's position in the design is preserved rather than the section
 * vanishing and leaving a gap the eye reads as a bug.
 */
export default function PreviousWinnersCarousel({ winners }: PreviousWinnersCarouselProps) {
  const hasWinners = winners !== undefined && winners.length > 0;

  return (
    <View  className='bg-white gap-3 p-3 rounded-xl border-sm'>
      <SectionHeader title="Previous Winners" />

      {/*
        The row's gap lives on a wrapper View rather than on the ScrollView's
        `contentContainerStyle`: NativeWind v4 has no `contentContainerClassName`,
        so a wrapper is the only way to keep this spacing in Tailwind.
      */}
      {hasWinners ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3">
            {winners.map((winner) => (
              <View
                key={`${winner.position}-${winner.name}`}
                className="w-[150px] gap-2 rounded-card border border-gray-200 bg-white p-2 shadow-sm elevation-2"
              >
                <View className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-gray-100">
                  {winner.imageUrl ? (
                    <Image
                      source={{ uri: winner.imageUrl }}
                      accessibilityLabel={winner.name}
                      resizeMode="cover"
                      className="h-full w-full"
                    />
                  ) : null}
                  <View className="absolute inset-0 items-center justify-center">
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-black/40">
                      <Ionicons name="play" size={16} color={COLORS.card} />
                    </View>
                  </View>
                </View>
                <Text numberOfLines={1} className="mt-2 text-[13px] font-bold text-gray-900">
                  {winner.name}
                </Text>
                <Text className="mt-0.5 text-[11px] text-gray-500">
                  {formatPositionLabel(winner.position)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View className="items-center rounded-card bg-gray-50 px-4 py-6">
          <Text className="text-xs text-gray-400">{EMPTY_LABEL}</Text>
        </View>
      )}
    </View>
  );
}
