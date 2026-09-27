import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';
import { formatDate, formatTime } from '@/lib/formatters';
import type { CompetitionDetails } from '@/types/competition';

export interface ImportantDatesGridProps {
  competition: CompetitionDetails;
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface DateCard {
  label: string;
  /** Null when the field is genuinely optional, e.g. an unset result date. */
  value: string | null;
  icon: IoniconName;
}

/**
 * The submission window is not served by the API, so those two cells fall back to
 * the event window (`startsAt`/`endsAt`), which is the nearest thing the server
 * states. `resultsAnnouncedAt` is genuinely optional, so a competition with no
 * result date renders an em dash rather than a fabricated one.
 */
function buildDateCards(competition: CompetitionDetails): DateCard[] {
  return [
    { label: 'Register Before', value: competition.registrationClosesAt, icon: 'clipboard-outline' },
    {
      label: 'Submission Starts',
      value: competition.submissionStartsAt ?? competition.startsAt,
      icon: 'play-outline',
    },
    {
      label: 'Submission Ends',
      value: competition.submissionClosesAt ?? competition.endsAt,
      icon: 'timer-outline',
    },
    { label: 'Result Date', value: competition.resultsAnnouncedAt ?? null, icon: 'trophy-outline' },
  ];
}

/** Two-by-two grid of the four dates a participant needs to plan around. */
export default function ImportantDatesGrid({ competition }: ImportantDatesGridProps) {
  const cards = buildDateCards(competition);
  const rows: DateCard[][] = [cards.slice(0, 2), cards.slice(2, 4)];

  return (
    <View className="rounded-xl gap-2 shadow-sm p-4 gray-250">
      <Text className="text-black font-bold">Important Dates!</Text>
    <View className="shadow-sm">

      {rows.map((row) => (
        <View key={row[0].label} className="flex-row shadow-sm ">
          {row.map((card) => (
            <View key={card.label} className="flex-1 gap-1 shadow-sm bg-gray-50 p-3">
              <View className="flex-row items-center  gap-1.5">
                <Ionicons name={card.icon} size={14} color={COLORS.primary} />
                <Text className="text-[11px] font-medium text-gray-600">{card.label}</Text>
              </View>
              <Text className="text-sm font-bold text-gray-900">{formatDate(card.value)}</Text>
              <Text className="text-[11px] text-gray-500">{formatTime(card.value)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
    </View>
  );
}
