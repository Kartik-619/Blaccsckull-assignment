/**
 * Design tokens. AGENTS.md §6.1 forbids hex codes outside this file and outside
 * `tailwind.config.js`; the `brand` / `medal` entries there carry the same
 * literals so `className` and inline `style` agree by construction.
 */
export const COLORS = Object.freeze({
  primary: '#0D7C7C',
  primaryDark: '#0A5F5F',
  primaryLight: '#E6F4F4',

  textDark: '#1A1A1A',
  textGray: '#6B7280',
  textLight: '#9CA3AF',
  background: '#F5F5F5',
  card: '#FFFFFF',
  border: '#E5E7EB',

  successBg: '#D1FAE5',
  successText: '#065F46',
  warning: '#F59E0B',
  warningBg: '#FEF3C7',
  danger: '#EF4444',
  referralBg: '#ECFDF5',

  medalGold: '#D4A017',
  medalSilver: '#9CA3AF',
  medalBronze: '#B45309',
} as const);
