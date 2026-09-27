import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';

const LABEL = 'Ad Here';

/** A reserved ad slot. Visual only — ad serving is out of scope. */
export default function AdPlaceholder() {
  return (
    <View
      accessibilityElementsHidden
      className="flex-row items-center justify-center gap-2 rounded-card border border-dashed border-gray-300 py-4"
    >
      <Ionicons name="megaphone-outline" size={14} color={COLORS.textLight} />
      <Text className="text-xs text-gray-400">{LABEL}</Text>
    </View>
  );
}
