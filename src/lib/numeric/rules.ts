/** Clamp with the lower bound taking priority when bounds are reversed. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Preserve callers whose upper bound takes priority when bounds are reversed. */
export function clampWithUpperPriority(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampPercentStat(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Substitute the fallback before clamping; the fallback itself may be non-finite. */
export function clampPercentStatOr(value: number, fallback: number): number {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.min(100, Math.max(0, safeValue));
}

/** Non-finite unit interval inputs become zero. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
