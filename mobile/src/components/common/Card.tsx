import type { ReactNode } from 'react';
import { View } from 'react-native';

export interface CardProps {
  children: ReactNode;
  className?: string;
}

/**
 * The white rounded surface every section sits on.
 *
 * `shadow-sm` and `elevation-2` are both present on purpose: each platform
 * silently ignores the other's prop, so the pair covers iOS and Android without a
 * `Platform.OS` branch. `elevation-*` is a local utility in `tailwind.config.js`.
 */
export default function Card({ children, className = '' }: CardProps) {
  return (
    <View className={`overflow-hidden rounded-card bg-white px-4 py-4 shadow-sm elevation-2 ${className}`}>
      {children}
    </View>
  );
}
