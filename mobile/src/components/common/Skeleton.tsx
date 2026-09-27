import { View } from 'react-native';

export interface SkeletonProps {
  className?: string;
}

/**
 * A static gray block. Deliberately not a shimmer: an animation library is out of
 * scope (AGENTS.md §2), and a placeholder whose only job is to hold the layout
 * open until data arrives does not need one.
 */
export default function Skeleton({ className = '' }: SkeletonProps) {
  return <View className={`rounded-md bg-gray-200 ${className}`} />;
}
