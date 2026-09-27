import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';

const LANGUAGES = ['ENG', 'हिंदी'] as const;
const ACTIVE_LANGUAGE = 'ENG';

/**
 * `router.back()` here is the one navigation call AGENTS.md §4.3 allows inside a
 * presentational component: a back arrow has no other way to work, and threading
 * an `onBack` prop through the only screen that renders it would be ceremony.
 *
 * The screen is reached by opening `/competition/<id>` directly (README), so the
 * stack usually holds this screen and nothing else, and an unconditional
 * `router.back()` dispatches a GO_BACK that no navigator can handle.
 *
 * The web branch is a platform split that AGENTS.md §10 asks to be documented:
 * `router.canGoBack()` throws outright under `IS_DOM`, and web `router.back()` is
 * already safe because it is turned into `history.back()`, which no-ops when there
 * is no history to pop. See DECISIONS.md.
 */
function hasHistory() {
  return Platform.OS === 'web' || router.canGoBack();
}

export default function TopBar() {
  return (
    <View className="flex-row items-center justify-between bg-background px-4 py-3">
      {hasHistory() ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          className="flex-row items-center gap-1"
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.textDark} />
          <Text className="text-sm font-semibold text-gray-900">Go back</Text>
        </Pressable>
      ) : null}

      {/*
        Static by design. There is no i18n in scope (AGENTS.md §1), so the
        inactive segment is a View rather than a Pressable: a control that
        looks tappable and does nothing is worse than one that reads as a label.

        `ml-auto` holds the pill to the right when the back control above is
        absent, since `justify-between` cannot space a lone child.
      */}
      <View className="ml-auto flex-row overflow-hidden rounded-full bg-gray-200 p-0.5">
        {LANGUAGES.map((language) => {
          const isActive = language === ACTIVE_LANGUAGE;
          return (
            <View
              key={language}
              className={`rounded-full px-3 py-1 ${isActive ? 'bg-white' : ''}`}
            >
              <Text
                className={`text-xs font-semibold ${isActive ? 'text-gray-900' : 'text-gray-500'}`}
              >
                {language}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
