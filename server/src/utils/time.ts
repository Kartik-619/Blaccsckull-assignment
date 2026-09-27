// Every helper takes the instant to work from as an argument. A rule that reads
// the clock itself can only be tested by waiting, and §14 forbids that.

export function nowUtc(): Date {
  return new Date();
}

export function isWithinWindow(now: Date, opensAt: Date, closesAt: Date): boolean {
  const timestamp = now.getTime();
  return timestamp >= opensAt.getTime() && timestamp <= closesAt.getTime();
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}
