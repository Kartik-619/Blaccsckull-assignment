import { Text, View } from 'react-native';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

/** Bold label with an optional trailing gray note, e.g. "Rewards (All Positions)". */
export default function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <View className="flex-row items-baseline gap-2">
      <Text className="text-base font-bold text-gray-900">{title}</Text>
      {subtitle ? <Text className="text-xs text-gray-500">{subtitle}</Text> : null}
    </View>
  );
}
