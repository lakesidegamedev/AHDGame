/** Timing-only diagnostics for the producer turn. Never read by settlement logic or hashed. */
export type StageTimings = Record<string, number | number[]>;

/** Per-pass lists are capped so a long planning run cannot bloat the turn record. */
const MAX_LISTED = 16;

/** Lap clock: each lap adds the time since the previous lap to a named stage. No-op without a sink. */
export function stageClock(sink?: StageTimings) {
  let last = performance.now();
  return {
    lap(key: string): void {
      if (!sink) return;
      const now = performance.now();
      sink[key] = ((sink[key] as number | undefined) ?? 0) + (now - last);
      last = now;
    },
  };
}

export function addStageTiming(sink: StageTimings | undefined, key: string, ms: number): void {
  if (sink) sink[key] = ((sink[key] as number | undefined) ?? 0) + ms;
}

export function listStageTiming(sink: StageTimings | undefined, key: string, ms: number): void {
  if (!sink) return;
  const list = (sink[key] ??= []) as number[];
  if (list.length < MAX_LISTED) list.push(ms);
}

/** Whole milliseconds, finite and non-negative, safe to store beside the receipt. */
export function roundStageTimings(sink: StageTimings): StageTimings {
  const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  return Object.fromEntries(
    Object.entries(sink).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(whole) : whole(value),
    ])
  );
}
