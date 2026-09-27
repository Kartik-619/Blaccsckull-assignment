import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { COLORS } from '@/lib/colors';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface NavItem {
  label: string;
  icon: IoniconName;
  isActive?: boolean;
  isFab?: boolean;
}

const ITEMS: readonly NavItem[] = [
  { label: 'Home', icon: 'home-outline' },
  { label: 'Explore', icon: 'search-outline' },
  { label: 'Add', icon: 'add', isFab: true },
  { label: 'Competitions', icon: 'trophy', isActive: true },
  { label: 'Profile', icon: 'person-outline' },
];

const OUT_OF_SCOPE_MESSAGE =
  'Only the Competition Details screen is implemented in this assignment';

/**
 * A visual replica of the app's tab bar. No navigation exists for it: the other
 * four screens are out of scope (AGENTS.md §1), so the items are focusable only
 * so the affordance is not a lie, and pressing one says so.
 */
export default function BottomTabBar() {
  const handlePress = (label: string) => () => Alert.alert(label, OUT_OF_SCOPE_MESSAGE);

  return (
    <View className="flex-row items-center justify-around border-t border-gray-200 bg-white px-2 pt-2">
      {ITEMS.map((item) => {
        const color = item.isActive ? COLORS.primary : COLORS.textGray;

        if (item.isFab) {
          return (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={handlePress(item.label)}
              className="-mt-3 h-10 w-10 items-center justify-center rounded-full bg-brand"
            >
              <Ionicons name={item.icon} size={24} color={COLORS.card} />
            </Pressable>
          );
        }

        return (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: item.isActive ?? false }}
            onPress={handlePress(item.label)}
            className="items-center gap-1 px-2 py-1"
          >
            <Ionicons name={item.icon} size={20} color={color} />
            <Text className={`text-[10px] ${item.isActive ? 'font-bold text-brand' : 'text-gray-500'}`}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
