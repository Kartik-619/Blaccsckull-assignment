import { View } from 'react-native';

import Skeleton from '@/components/common/Skeleton';

const CARD_GAP = 'gap-3';

/**
 * Mirrors the real section layout so the screen does not reflow when data lands
 * (AGENTS.md §7.3). Deliberately not a spinner: the shapes here are the shapes
 * that are about to be replaced.
 */
export default function CompetitionSkeleton() {
  return (
    <View className={`gap-3 ${CARD_GAP}`}>
      <View className="gap-3 rounded-card bg-white p-4">
        <Skeleton className="h-7 w-3/4" />
        <View className="mt-1 flex-row gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </View>
        <View className="mt-3 flex-row justify-between">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-20" />
        </View>
      </View>

      <View className="gap-3 rounded-card bg-white p-4">
        <View className="flex-row items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </View>
          <Skeleton className="h-11 w-11 rounded-full" />
        </View>
      </View>

      <View className="rounded-card bg-brand-light p-4">
        <Skeleton className="h-4 w-full" />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-2 rounded-card bg-white p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-24" />
        </View>
        <View className="flex-1 gap-2 rounded-card bg-white p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-24" />
        </View>
      </View>

      <View className="gap-3 rounded-card bg-white p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </View>

      <View className="gap-3 rounded-card bg-white p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
      </View>

      <View className="h-14 w-full rounded-card bg-brand" />
    </View>
  );
}
