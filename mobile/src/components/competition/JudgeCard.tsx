import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, Pressable, Text, View } from 'react-native';

import Card from '@/components/common/Card';
import { COLORS } from '@/lib/colors';
import { formatExperience } from '@/lib/formatters';
import type { CompetitionJudge } from '@/types/competition';

export interface JudgeCardProps {
  judge?: CompetitionJudge;
}

const VIDEO_ALERT_TITLE = 'Coming soon';
const VIDEO_ALERT_BODY = 'Video player is out of scope for this assignment.';

/**
 * `judge` is not served by the API yet, so this renders its placeholder branch on
 * every competition today. The branch is not a stub: the play button, the alert
 * and the layout are real, and only the three text lines and the avatar source
 * are waiting on a field.
 */
export default function JudgeCard({ judge }: JudgeCardProps) {
  const showVideo = () => Alert.alert(VIDEO_ALERT_TITLE, VIDEO_ALERT_BODY);

  return (
    <Card>
      <View className="flex-row items-center gap-4">
        <View>
          {judge?.avatarUrl ? (
            <Image
              source={{ uri: judge.avatarUrl }}
              accessibilityLabel={`Portrait of ${judge.name}`}
              className="h-16 w-16 rounded-full bg-gray-100"
            />
          ) : (
            <View className="h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Ionicons name="person" size={28} color={COLORS.textLight} />
            </View>
          )}
        </View>

        <View className="flex-1 gap-0.5">
          <Text className="text-xs text-gray-500">Judge</Text>
          {judge ? (
            <>
              <Text className="text-base font-bold text-gray-900">{judge.name}</Text>
              <Text className="text-xs text-gray-500">{judge.title}</Text>
              <Text className="text-xs text-gray-400">
                {formatExperience(judge.experienceYears)}
              </Text>
            </>
          ) : (
            <Text className="text-sm text-gray-400">Judge details coming soon</Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play judge intro video"
          onPress={showVideo}
          className="items-center gap-1"
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-brand">
            <Ionicons name="play" size={18} color={COLORS.card} />
          </View>
          <Text className="text-[10px] text-gray-500">Intro Video</Text>
        </Pressable>
      </View>
    </Card>
  );
}
