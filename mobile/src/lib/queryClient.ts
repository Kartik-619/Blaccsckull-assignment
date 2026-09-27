import { QueryClient } from '@tanstack/react-query';

export const COMPETITION_STALE_TIME_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: COMPETITION_STALE_TIME_MS,
      // React Native has no window-focus event, and React Query's focus manager
      // can refetch spuriously on screen transitions on some navigators.
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
