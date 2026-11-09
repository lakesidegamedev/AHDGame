/**
 * Turnout for nationwide contests that have no regional census row, plus the
 * per-turn pool caps. Regional contests take turnout from the census cells
 * (`buildGranularElectorateSubstrate`).
 */

import type { DemographicCategory, StateDemographics } from "@/lib/db/types";
import type { StateDemographicTurnout } from "@/lib/db/types/stateDemographicTurnout";

export interface ResolvedTurnout {
  /** Effective turnout percentage (0-100) for each group ID */
  byGroup: Record<string, number>;
  /** Total weighted turnout pool for the state */
  totalPool: number;
}

export interface ResolvedTurnoutOptions {
  /** Optional explicit turnout modifiers to apply (groupId -> modifier in percentage points) */
  modifierOverrides?: Record<string, number>;
  /** Clamp minimum turnout to this value (default: 0) */
  minTurnout?: number;
  /** Clamp maximum turnout to this value (default: 100) */
  maxTurnout?: number;
}

/**
 * Resolve effective turnout rates for all demographic groups in a state.
 * Combines baseline turnout from StateDemographics with runtime modifiers
 * from StateDemographicTurnout (GOTV/canvassing/suppression), clamped and
 * applied as percentage point adjustments.
 */
export function resolveTurnout(
  statePopulation: number,
  demographics: StateDemographics,
  categories: DemographicCategory[],
  turnoutDoc: StateDemographicTurnout | null | undefined,
  options: ResolvedTurnoutOptions = {}
): ResolvedTurnout {
  const { modifierOverrides, minTurnout = 0, maxTurnout = 100 } = options;

  const byGroup: Record<string, number> = {};
  let totalPool = 0;

  // Category weights partition the SAME electorate into different slices
  // (voterGroups vs age vs education …), so they must be treated as relative
  // weights that sum to 1 — otherwise a world whose categoryWeights sum to >100
  // inflates the pool above the state population (the "election has more votes
  // than people" bug). Normalize by their actual sum instead of a hard-coded
  // 100; falls back to 100 when no positive weights exist.
  const totalCategoryWeight =
    categories.reduce((sum, c) => {
      const w = demographics.categoryWeights[c._id] ?? 0;
      return w > 0 ? sum + w : sum;
    }, 0) || 100;

  for (const category of categories) {
    const categoryWeight = demographics.categoryWeights[category._id] ?? 0;
    if (categoryWeight <= 0) continue;

    for (const group of category.groups) {
      const stateGroup = demographics.groups[group.id];

      const baselineTurnout =
        typeof stateGroup?.turnout === "number" ? stateGroup.turnout : (group.defaultTurnout ?? 55);

      let modifier = 0;
      if (turnoutDoc?.modifiers) {
        for (const [_categoryId, groupModifiers] of Object.entries(turnoutDoc.modifiers)) {
          if (groupModifiers && typeof groupModifiers === "object") {
            const groupModifier = groupModifiers[group.id];
            if (typeof groupModifier === "number") {
              modifier += groupModifier;
            }
          }
        }
      }

      if (modifierOverrides?.[group.id] != null) {
        modifier = modifierOverrides[group.id];
      }

      const effectiveTurnout = Math.max(
        minTurnout,
        Math.min(maxTurnout, baselineTurnout + modifier)
      );

      byGroup[group.id] = effectiveTurnout;

      const populationPct = stateGroup?.population ?? 0;
      const groupContribution = statePopulation * (populationPct / 100) * (effectiveTurnout / 100);
      totalPool += groupContribution * (categoryWeight / totalCategoryWeight);
    }
  }

  // Hard guarantee: the vote pool can never exceed the eligible electorate,
  // whatever the category/group data looks like. Turnout ≤ 100% already keeps
  // it under normally; this is the backstop against malformed demographics.
  return { byGroup, totalPool: Math.round(Math.min(totalPool, statePopulation)) };
}

/**
 * Cap a turn's released vote slice so the whole window cannot exceed the
 * electorate.
 *
 * Deliberately scales the SLICE only. The distributors normalise each group's
 * contribution by the totalPool they are handed and then multiply by the
 * slice, so "capping" by shrinking both the slice and the pool cancels to the
 * ballot and caps nothing (live-verified via the registered-voter gate's
 * first, broken placement). The caller must keep passing the truthful,
 * uncapped pool as the normalisation base.
 */
export function capTurnSliceToElectorate(
  slice: number,
  totalPool: number,
  electorate: number
): number {
  if (totalPool > electorate && electorate > 0) return slice * (electorate / totalPool);
  return slice;
}

/**
 * Scale a general-election vote pool down to the REGISTERED electorate.
 *
 * The resolved pool spans the whole electorate, but unregistered voters cannot
 * cast a general ballot; scaling keeps the general consistent with the primary
 * (which only draws registered slices).
 *
 * Shares are invariant to pool magnitude, so only ballot counts and turnout
 * percentages change, never outcomes.
 *
 * Missing or non-finite `unregisteredPct` leaves the pool untouched.
 */
export { scalePoolToRegistered } from "./rules/registration";

/**
 * Hard ceiling on CUMULATIVE ballots: this turn's slice can release at most
 * the electorate that has not voted yet. The per-turn cap and registered
 * gate above bound the slice, but the office-strength/approval multiplier
 * is applied after them, so the closing surge could still push a race past
 * 100% turnout (a DD governor race certified 102.1%). Shrinking the slice
 * before distribution keeps shares invariant; only the final slice(s) lose
 * magnitude. A non-positive electorate (no state doc) leaves the slice alone.
 */
export function capTurnSliceToRemainingElectorate(
  slice: number,
  alreadyCast: number,
  electorate: number
): number {
  if (!(electorate > 0)) return slice;
  return Math.max(0, Math.min(slice, electorate - alreadyCast));
}
