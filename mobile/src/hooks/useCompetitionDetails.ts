import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import type { ApiEnvelope } from '@/constants/enums';
import { api, unwrap, type ApiError } from '@/lib/api';
import { COMPETITION_STALE_TIME_MS } from '@/lib/queryClient';
import type { CompetitionDetails } from '@/types/competition';

const DETAIL_PATH = '/competitions';

export function competitionQueryKey(id: string) {
  return ['competition', id] as const;
}

/**
 * The detail route is optional-auth, so a 404 here is a missing competition
 * rather than a missing user. Checking the status instead of the code keeps the
 * screen honest if the route ever returns a different 404. Accepts `null` because
 * React Query models "no error" that way.
 */
export function isNotFoundError(error: ApiError | null): boolean {
  return error?.status === 404;
}

async function fetchCompetitionDetails(id: string): Promise<CompetitionDetails> {
  const response = await api.get<ApiEnvelope<CompetitionDetails>>(`${DETAIL_PATH}/${id}`);
  return unwrap(response.data);
}

export function useCompetitionDetails(id: string | undefined) {
  const queryClient = useQueryClient();
  const resolvedId = id ?? '';

  const query = useQuery<CompetitionDetails, ApiError>({
    queryKey: competitionQueryKey(resolvedId),
    queryFn: () => fetchCompetitionDetails(resolvedId),
    enabled: id !== undefined && id !== '',
    staleTime: COMPETITION_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // AGENTS.md §7.4: no optimistic update and no manual cache write. The server
  // returns the whole competition from this call, so the refetch is one round
  // trip and the badge and the spots counter both move together.
  const register = useMutation<CompetitionDetails, ApiError, void>({
    mutationFn: async () => {
      const response = await api.post<ApiEnvelope<CompetitionDetails>>(
        `${DETAIL_PATH}/${resolvedId}/register`,
        {},
      );
      return unwrap(response.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: competitionQueryKey(resolvedId) });
      Toast.show({ type: 'success', text1: 'Successfully registered!' });
    },
    onError: (error) => {
      Toast.show({ type: 'error', text1: 'Registration failed', text2: error.message });
    },
  });

  return { ...query, register };
}
