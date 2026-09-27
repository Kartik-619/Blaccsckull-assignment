import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import Card from '@/components/common/Card';
import { COLORS } from '@/lib/colors';
import type { CompetitionDetails } from '@/types/competition';

export interface TabsSectionProps {
  competition: CompetitionDetails;
}

type TabKey = 'ABOUT' | 'JUDGING' | 'RULES';

const TABS: readonly { key: TabKey; label: string }[] = [
  { key: 'ABOUT', label: 'About Competition' },
  { key: 'JUDGING', label: 'Judging Parameters' },
  { key: 'RULES', label: 'Rules & Eligibility' },
];

const COLLAPSED_LINES = 3;
const UNAVAILABLE_LABEL = 'This section is not published for this competition yet.';

export default function TabsSection({ competition }: TabsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('ABOUT');
  const [isExpanded, setIsExpanded] = useState(false);

  const description = competition.description;
  const isLongDescription = description.length > 240;

  return (
    <Card>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-5">
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveTab(tab.key)}
                className="gap-2"
              >
                <Text
                  className={`text-sm ${isActive ? 'font-bold text-brand' : 'font-medium text-gray-500'}`}
                >
                  {tab.label}
                </Text>
                <View className={`h-0.5 ${isActive ? 'bg-brand' : 'bg-transparent'}`} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {activeTab === 'ABOUT' ? (
        <View className="mt-4 gap-2">
          <Text
            className="text-sm leading-5 text-gray-700"
            numberOfLines={isExpanded || !isLongDescription ? undefined : COLLAPSED_LINES}
          >
            {description}
          </Text>
          {isLongDescription ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? 'View less' : 'View more'}
              onPress={() => setIsExpanded((previous) => !previous)}
              className="flex-row items-center gap-1"
            >
              <Text className="text-xs font-semibold text-brand">
                {isExpanded ? 'View less' : 'View more'}
              </Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={COLORS.primary}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {activeTab === 'JUDGING' ? (
        <Text className="mt-4 text-sm leading-5 text-gray-700">
          {competition.judgingParameters ?? UNAVAILABLE_LABEL}
        </Text>
      ) : null}

      {activeTab === 'RULES' ? (
        <View className="mt-4 gap-3">
          {competition.rules.length > 0 ? (
            <View className="gap-2">
              {competition.rules.map((rule, index) => (
                <View key={`${index}-${rule}`} className="flex-row gap-2">
                  <Text className="text-sm leading-5 text-gray-500">•</Text>
                  <Text className="flex-1 text-sm leading-5 text-gray-700">{rule}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {competition.eligibility ? (
            <View className="gap-1">
              <Text className="text-xs font-bold text-gray-900">Eligibility</Text>
              <Text className="text-sm leading-5 text-gray-700">{competition.eligibility}</Text>
            </View>
          ) : null}
          {competition.rules.length === 0 && !competition.eligibility ? (
            <Text className="text-sm leading-5 text-gray-700">{UNAVAILABLE_LABEL}</Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
