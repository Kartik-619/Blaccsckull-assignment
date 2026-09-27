import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';

import { DEV_COMPETITION_ID } from '@/lib/api';

const MISSING_ID_TITLE = 'No competition configured';
const MISSING_ID_MESSAGE =
  'Set EXPO_PUBLIC_DEV_COMPETITION_ID in .env to the id `npm run seed` printed, then restart the dev server with --clear.';

/**
 * `/` is a redirect, not a screen. The brief is one screen, so there is no home
 * to render; this only exists so the app opens on something real instead of
 * Expo Router's "Unmatched Route" placeholder. See DECISIONS.md.
 */
export default function Index() {
  // Redirecting to `/competition/` with an empty id would land on the unmatched
  // route this file exists to avoid, so an unconfigured value says so instead.
  if (DEV_COMPETITION_ID === '') {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-background px-6">
        <Text className="text-center text-lg font-bold text-gray-900">{MISSING_ID_TITLE}</Text>
        <Text className="text-center text-sm text-gray-500">{MISSING_ID_MESSAGE}</Text>
      </View>
    );
  }

  return <Redirect href={`/competition/${DEV_COMPETITION_ID}`} />;
}
