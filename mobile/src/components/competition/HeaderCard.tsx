import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import Card from '@/components/common/Card';
import StatsRow from '@/components/competition/StatsRow';
import { COLORS } from '@/lib/colors';
import type { CompetitionDetails } from '@/types/competition';

export interface HeaderCardProps {
  competition: CompetitionDetails;
}

const CERTIFICATE_NOTE = 'Winners get certificate';

/**
 * Title, registration badge, tags, certificate note and the stats row. The badge
 * is the only part of the screen that depends on the viewer rather than on the
 * competition, and `userState` is null for an anonymous caller, so the whole card
 * treats that as "not registered" rather than special-casing it per field.
 */
export default function HeaderCard({ competition }: HeaderCardProps) {
  const isRegistered = competition.userState?.relationship === 'REGISTERED';

  return (
    <Card>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-2xl font-bold leading-7 text-gray-900">
          {competition.title}
        </Text>

        {isRegistered ? (
          <View className="flex-row items-center gap-1 rounded-full bg-green-100 px-2 py-1">
            <Ionicons name="checkmark-circle" size={12} color={COLORS.successText} />
            <Text className="text-[10px] font-semibold text-green-800">Registered</Text>
          </View>
        ) : null}
      </View>

      {competition.tags.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {competition.tags.map((tag) => (
            <View key={tag} className="rounded-full bg-gray-100 px-3 py-1">
              <Text className="text-xs font-medium text-gray-700">{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* The API does not serve `certificateProvided` yet, so this is driven by
          the type rather than by data. It appears the moment the field lands. */}
      {competition.certificateProvided ? (
        <View className="mt-3 flex-row items-center gap-2">
          <Ionicons name="trophy" size={14} color={COLORS.medalGold} />
          <Text className="text-xs text-gray-600">{CERTIFICATE_NOTE}</Text>
        </View>
      ) : null}

      <StatsRow
        prizePoolAmount={competition.prizePool.totalAmount}
        currency={competition.prizePool.currency}
        entryFeeAmount={competition.entryFee.amount}
        spotsRemaining={competition.spotsRemaining}
        currentParticipantCount={competition.currentParticipantCount}
        maxParticipants={competition.maxParticipants}
      />
    </Card>
  );
}
