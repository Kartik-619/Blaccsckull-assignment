import dayjs from 'dayjs';

const DATE_FORMAT = 'DD MMM YY';
const TIME_FORMAT = 'hh:mm A';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

const ORDINALS = ['th', 'st', 'nd', 'rd'] as const;

function ordinalSuffix(value: number): string {
  // 11/12/13 take 'th' despite ending in 1/2/3, which is the whole reason this is
  // not `value % 10`.
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return 'th';
  }
  return ORDINALS[value % 10] ?? 'th';
}

/**
 * Every date on this screen is rendered in the device's zone. That is a display
 * choice only: no lifecycle decision reads any of these values (AGENTS.md §9),
 * so a device in another zone sees different clock times but the same state.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return dayjs(value).format(DATE_FORMAT);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return dayjs(value).format(TIME_FORMAT);
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unknown ISO code from the API must not take the screen down.
    return `${currency} ${amount}`;
  }
}

/** `₹0` is a real answer (a free competition), so the caller checks the amount. */
export function isFreeEntryFee(amount: number): boolean {
  return amount === 0;
}

export function formatPositionLabel(position: number): string {
  return `${position}${ordinalSuffix(position)} Winner`;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/** Clamps to 0–100 so a counter that overshot the cap cannot overflow the track. */
export function toPercentage(current: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (current / total) * 100));
}

/** Zero-padded so the ticking seconds digit keeps its column. */
function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function splitDuration(totalMs: number): CountdownParts {
  const clamped = Math.max(0, totalMs);
  const totalSeconds = Math.floor(clamped / MS_PER_SECOND);

  return {
    days: Math.floor(totalSeconds / SECONDS_PER_DAY),
    hours: Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR),
    minutes: Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    seconds: totalSeconds % SECONDS_PER_MINUTE,
    isExpired: clamped <= 0,
  };
}

/** `03d : 04h : 05m : 06s`, the banner's fixed-width format. */
export function formatCountdown(parts: CountdownParts): string {
  return [
    `${pad(parts.days)}d`,
    `${pad(parts.hours)}h`,
    `${pad(parts.minutes)}m`,
    `${pad(parts.seconds)}s`,
  ].join(' : ');
}

export function formatExperience(years: number): string {
  return `${years}+ Years of Experience`;
}
