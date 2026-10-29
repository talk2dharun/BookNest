const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Turns env values like "15m" or "7d" into milliseconds. */
export function parseDurationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}". Use a value like 15m or 7d.`);
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
