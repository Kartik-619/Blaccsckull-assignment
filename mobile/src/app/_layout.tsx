import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { queryClient } from '@/lib/queryClient';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        {/*
          Toast has to sit inside QueryClientProvider only because it is a sibling
          of the navigator here; it has no provider of its own to nest inside.
        */}
        <Toast />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
