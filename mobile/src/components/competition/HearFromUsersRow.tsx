import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, Text, View } from 'react-native';

import Card from '@/components/common/Card';
import { COLORS } from '@/lib/colors';

const TITLE = 'Hear From Our Users';
const SUBTITLE = 'See what participants say about Feedants';

export default function HearFromUsersRow() {
  const handlePress = () =>
    Alert.alert('Coming soon', 'Participant testimonials are not available yet.');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={TITLE}
      onPress={handlePress}
    >
      <Card className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-light">
          <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.primary} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-bold text-gray-900">{TITLE}</Text>
          <Text className="text-[11px] text-gray-500">{SUBTITLE}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
      </Card>
    </Pressable>
  );
}
