/**
 * Overton-window guardrails for party charter platform axes.
 * Each axis is bounded to `[-60, +60]`. Post-ratification platform changes
 * flow through `CommitteeProposal.positionShift`, not through amendments.
 */

import type { PartyCharterPlatform } from "@/lib/db/types";

/** Lower bound for any platform axis. */
export const PLATFORM_AXIS_MIN = -60 as const;
/** Upper bound for any platform axis. */
export const PLATFORM_AXIS_MAX = 60 as const;

/**
 * Clamp a single axis to the Overton bounds defensively. Used at draft-
 * creation time so even a pathological client can't slide past `±60`.
 */
export function clampPlatformAxis(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(PLATFORM_AXIS_MIN, Math.min(PLATFORM_AXIS_MAX, value));
}

/** Apply `clampPlatformAxis` to every axis on a platform. */
export function clampPlatform(platform: PartyCharterPlatform): PartyCharterPlatform {
  return {
    economic: clampPlatformAxis(platform.economic),
    social: clampPlatformAxis(platform.social),
  };
}
