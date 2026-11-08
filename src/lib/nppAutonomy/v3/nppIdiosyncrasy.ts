/**
 * PER-NPP IDIOSYNCRASY (V3/V4)
 *
 * Archetypes explain why a reformer campaigns harder than a steward, but
 * not why this particular reformer never stops fundraising. This module
 * gives each NPP a small, stable, private set of quirks on top of their
 * archetype: a multiplicative jitter per career modifier, plus a
 * decisiveness (temperature) offset.
 *
 * Quirks are DERIVED, not stored: a hash of the NPP's stable `sequentialId`.
 * No collection, no migration, no per-cycle write amplification, and
 * identical on every read.
 *
 * The hash folds in a slowly-advancing phase counter, so quirks drift every
 * few hundred turns. This reads as a career arc rather than noise, since it
 * changes once over a long span instead of re-rolling each cycle.
 *
 * Deterministic and replay-safe: same inputs, same quirks. Reads a hash
 * directly rather than drawing from an RNG sequence, so it cannot disturb
 * any caller's rng() call count.
 */

import { hashToUint32 } from "@/lib/events/substrate/rng";
import { clampCareerModifiers, type CareerArchetypeModifiers } from "./careerArchetype";

/**
 * Turns per career phase. ~200 turns (turns are hourly) is long enough that a
 * player watching one NPP sees consistent behaviour for a meaningful stretch,
 * and short enough that a long-running world isn't static.
 */
export const CAREER_PHASE_TURNS = 200;

/** Maximum multiplicative jitter applied to each career modifier (±10%). */
export const IDIOSYNCRASY_JITTER = 0.1;

/** Maximum additive swing on the decisiveness/temperature multiplier (±25%). */
const IDIOSYNCRASY_TEMPERATURE_SWING = 0.25;

const MODIFIER_FIELDS: (keyof CareerArchetypeModifiers)[] = [
  "campaignAggressionMult",
  "fundraiseAppetiteMult",
  "officeSeekingMult",
  "legislativeActivityMult",
  "saveInvestAppetiteMult",
  "riskToleranceMult",
];

/** Deterministic [0,1) value for one named quirk of one NPP in one career phase. */
function quirk(nppKey: string, phase: number, field: string): number {
  return hashToUint32(`npp-idio:${nppKey}:${phase}:${field}`) / 0x1_0000_0000;
}

/** Which career phase a turn falls in. Exported for tests and diagnostics. */
export function careerPhase(currentTurn: number): number {
  return Math.floor(currentTurn / CAREER_PHASE_TURNS);
}

export interface NppIdiosyncrasy {
  /** Career modifiers with this NPP's personal jitter applied, re-clamped. */
  modifiers: CareerArchetypeModifiers;
  /**
   * Multiplier on the action-selection temperature. Below 1 = this NPP is more
   * single-minded than their archetype suggests; above 1 = more erratic.
   */
  temperatureMult: number;
}

/**
 * Apply this NPP's personal quirks to their archetype modifiers.
 *
 * `nppKey` should be the stable `sequentialId` (fall back to the `_id` string
 * only when absent) — the same key the action RNG uses, so an NPP's quirks and
 * their action stream stay consistent with each other.
 */
export function applyNppIdiosyncrasy(
  base: CareerArchetypeModifiers,
  nppKey: string,
  currentTurn: number
): NppIdiosyncrasy {
  const phase = careerPhase(currentTurn);

  const jittered = {} as CareerArchetypeModifiers;
  for (const field of MODIFIER_FIELDS) {
    // quirk in [0,1) → factor in [1 - JITTER, 1 + JITTER)
    const factor = 1 + (quirk(nppKey, phase, field) * 2 - 1) * IDIOSYNCRASY_JITTER;
    jittered[field] = base[field] * factor;
  }

  const temperatureMult =
    1 + (quirk(nppKey, phase, "temperature") * 2 - 1) * IDIOSYNCRASY_TEMPERATURE_SWING;

  return { modifiers: clampCareerModifiers(jittered), temperatureMult };
}
