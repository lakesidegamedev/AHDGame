import * as R from "./config";
import { computeEffectivePower } from "@/lib/constants/military";
import type { NavairUnit, NavairMission } from "./types";

/**
 * Derived values for the naval and air layer.
 *
 * Combat value starts from the game's own `computeEffectivePower`, which already folds
 * base power, posture, tech tier, veterancy, equipment and strength ratio. This module
 * adds only what is specific to sea and sky: damage, supply at station, and the mission
 * the formation is flying or sailing.
 *
 * It deliberately does NOT re-derive power from a unit archetype table. A naval unit is
 * worth what the rest of the game says it is worth, or procurement, doctrine and
 * veterancy would stop meaning anything the moment a ship put to sea.
 */

export type CvWeight = "embargo" | "combat" | "signature";

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Damage multiplier. A wreck still floats and still counts for something. */
export function integrityMult(integrity: number | undefined): number {
  return clamp(integrity ?? 100, 0, 100) / 100;
}

/** Readiness multiplier, floored so a worn formation is degraded and not deleted. */
function readinessMult(readiness: number): number {
  return R.READINESS_FLOOR + (1 - R.READINESS_FLOOR) * (clamp(readiness, 0, 100) / 100);
}

/** Supply multiplier, floored for the same reason. */
function supplyMult(supply: number | undefined): number {
  return R.SUPPLY_FLOOR + (1 - R.SUPPLY_FLOOR) * (clamp(supply ?? 100, 0, 100) / 100);
}

/**
 * Mission weights, widened for lookup by a runtime string.
 *
 * A unit's mission is stored, so it cannot be narrowed at the type level without lying
 * about data that came out of the database. Widen once here rather than casting at every
 * call site.
 */
interface MissionWeights {
  label: string;
  embargo: number;
  combat: number;
  signature: number;
  readiness: number;
  desc: string;
}

const NAVAL_MISSIONS = R.NAVAL_MISSIONS as unknown as Record<string, MissionWeights>;

/** Naval mission weights, or undefined when the mission is not a naval one. */
function navalMission(mission: NavairMission | null | undefined): MissionWeights | undefined {
  return mission ? NAVAL_MISSIONS[mission] : undefined;
}

/**
 * A hull flying an air mission instead of a naval one.
 *
 * A carrier on combat air patrol is not blockading anything and is not hunting a surface
 * action: its wing is in the air. Without this a carrier gets its air mission for free
 * and keeps full lane pressure, which removes the central decision of the whole design.
 */
const FLYING_WEIGHTS: Record<CvWeight, number> = { embargo: 0, combat: 0.5, signature: 1.0 };

/** Combat value before any mission weighting. */
export function baseCv(unit: NavairUnit): number {
  return (
    computeEffectivePower(unit) *
    integrityMult(unit.integrity) *
    readinessMult(unit.readiness) *
    supplyMult(unit.supply)
  );
}

/** Combat value as weighted by what the formation is currently doing. */
export function cv(unit: NavairUnit, weight: CvWeight): number {
  if (unit.domain !== "naval") return baseCv(unit);
  const mission = navalMission(unit.mission);
  const w = mission ? mission[weight] : FLYING_WEIGHTS[weight];
  return baseCv(unit) * (w ?? 1);
}

/** `BERTH_COST` by runtime type string. */
export function berthCostOf(type: string): number {
  return (R.BERTH_COST as Record<string, number>)[type] ?? 1;
}

export const alive = (u: NavairUnit): boolean => (u.integrity ?? 100) > 0;

/**
 * How many regions out an air formation can operate.
 *
 * Naval formations move by sailing and are handled by the map's naval routing, so they
 * have no radius here. An unrecognised air type falls back to 1, which is the smallest
 * useful reach rather than zero: a wing that cannot leave its own region is a wing that
 * can never do anything, and that failure is silent.
 */
export function archetypeRadius(unit: NavairUnit): number {
  if (unit.domain !== "air") return 1;
  const arch = (R.AIR_TYPES as Record<string, { radius?: number }>)[unit.type];
  return Math.max(1, arch?.radius ?? 1);
}

export function sum<T>(arr: readonly T[], f: (x: T) => number): number {
  return arr.reduce((t, x) => t + f(x), 0);
}
