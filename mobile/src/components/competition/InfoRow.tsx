import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const ALERT_TITLE = 'Coming soon';

interface InfoCard {
  icon: IoniconName;
  title: string;
  subtitle: string;
  /** Static product name under the subtitle, e.g. the payment provider. */
  footnote?: string;
}

const CARDS: readonly InfoCard[] = [
  {
    icon: 'play',
    title: 'How will you receive prize money?',
    subtitle: 'Watch video to know more',
  },
  {
    icon: 'shield-checkmark',
    title: 'Refund policy',
    subtitle: 'Secure payments powered by',
    footnote: 'Razorpay',
  },
];

/**
 * Two informational cards. The right one names Razorpay as static text: payment
 * integration is out of scope for this assignment, and the copy is a statement
 * about the product rather than a claim about this build.
 */
export default function InfoRow() {
  const handlePress = (title: string) => () =>
    Alert.alert(ALERT_TITLE, `${title} is out of scope for this assignment.`);

  return (
    <View className="flex-row gap-3">
      {CARDS.map((card) => (
        <Pressable
          key={card.title}
          accessibilityRole="button"
          accessibilityLabel={card.title}
          onPress={handlePress(card.title)}
          className="flex-1 gap-2 rounded-card bg-white p-4 shadow-sm"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-light">
            <Ionicons name={card.icon} size={16} color={COLORS.primary} />
          </View>
          <Text className="text-xs font-bold leading-4 text-gray-900">{card.title}</Text>
          <Text className="text-[11px] leading-4 text-gray-500">{card.subtitle}</Text>
          {card.footnote ? (
            <Text className="text-xs font-bold text-gray-900">{card.footnote}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
