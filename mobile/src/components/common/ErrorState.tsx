import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';

export interface ErrorStateProps {
  title: string;
  message: string;
  /**
   * Optional because a 404 reached by opening a bad path directly has no history
   * to pop, and a button labelled "Go back" that navigates nowhere is worse than
   * no button at all. The network-failure caller always passes both.
   */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * The screen's single failure surface. It carries one action rather than a fixed
 * retry button because the two callers want opposite things: a network failure
 * wants "Retry", a 404 wants "Go back" — retrying a competition that does not
 * exist would just fail again.
 */
export default function ErrorState({ title, message, actionLabel, onAction }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-gray-200">
        <Ionicons name="alert-circle-outline" size={32} color={COLORS.textGray} />
      </View>
      <Text className="text-center text-lg font-bold text-gray-900">{title}</Text>
      <Text className="text-center text-sm text-gray-500">{message}</Text>
      {actionLabel === undefined || onAction === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          className="rounded-card bg-brand px-8 py-3"
        >
          <Text className="text-sm font-bold text-white">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
