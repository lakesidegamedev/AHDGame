import { SOCI_DANGER_ZONE, CONCENTRATION_MULTIPLIER_MAX } from "./constants";

/** Pure SOCI clamp, kept free of server imports so client views can reach it. */

/** Clamp any value into the SOCI range [0,100]; non-finite ⇒ 0. */
export function clampConcentration(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/**
 * Escalation multiplier (>= 1.0). Exactly 1.0 at/below the danger zone, then a
 * convex (quadratic) ramp to CONCENTRATION_MULTIPLIER_MAX at SOCI 100 - early
 * takings barely escalate, empire-building bites hard.
 */
export function sociMultiplier(soci: number): number {
  const s = clampConcentration(soci);
  if (s <= SOCI_DANGER_ZONE) return 1;
  const span = 100 - SOCI_DANGER_ZONE;
  const t = (s - SOCI_DANGER_ZONE) / span; // 0..1 past the knee
  return 1 + (CONCENTRATION_MULTIPLIER_MAX - 1) * t * t;
}
