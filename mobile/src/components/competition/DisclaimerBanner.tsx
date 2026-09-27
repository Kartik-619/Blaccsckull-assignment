import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';

export interface DisclaimerBannerProps {
  disclaimer?: string;
}

/**
 * The server does not serve `disclaimer`, so this renders nothing today. It is
 * kept as a component rather than inlined because the moment the field lands the
 * section appears with no route change — and because the design puts it on screen.
 */
export default function DisclaimerBanner({ disclaimer }: DisclaimerBannerProps) {
  if (!disclaimer) {
    return null;
  }

  return (
    <View className="flex-row items-start gap-2 rounded-card bg-gray-100 px-4 py-3">
      <Ionicons name="information-circle" size={16} color={COLORS.textGray} />
      <Text className="flex-1 text-xs leading-4 text-gray-600">{disclaimer}</Text>
    </View>
  );
}
