/**
 * Produces a primary-voter electorate from a state's general-electorate
 * demographics by **scaling turnout per electorate unit based on directional alignment
 * with the party** (not distance from it).
 *
 * The distinction matters. A Dem primary voter at (-4, -4) is MORE extreme
 * than the Dem party at (-2, -2) — they participate heavily; a distance-based
 * penalty would (wrongly) punish them for being too far left. A symmetric
 * "distance from party" model can't capture this asymmetry.
 *
 * Model: project the voter's ideology vector onto the party's ideology axis
 * and normalize. Voters whose projection is ≥ party's own magnitude participate
 * fully. Voters near the origin (no ideology) participate lightly. Voters on
 * the opposite side don't participate at all.
 *
 *   alignment = (voter · party) / |party|²
 *
 * Turnout retention = clamp(alignment, floor, 1.0).
 *
 *   Voter (-4,-4), Dem (-2,-2): alignment = 2.0 → retention 1.0 (base voter)
 *   Voter (-2,-2), Dem (-2,-2): alignment = 1.0 → retention 1.0 (aligned)
 *   Voter (-1,-1), Dem (-2,-2): alignment = 0.5 → retention 0.5 (soft Dem)
 *   Voter ( 0, 0), Dem (-2,-2): alignment = 0.0 → retention floor (centrist)
 *   Voter (+2,+2), Dem (-2,-2): alignment = -1.0 → retention floor (opposed)
 *
 * The FLOOR prevents numerical collapse but is tiny — opposed voters have
 * ≈0 weight in the primary pool.
 */

import type { ElectorateUnit } from "@/lib/demographics/electorateUnit";

/** Minimum fraction of general turnout any unit retains (prevents zero-division). */
const PRIMARY_TURNOUT_FLOOR = 0.05;

/**
 * Baseline retention at "zero alignment" (perfect centrist voter). Higher values
 * make the primary electorate less different from the general — centrists still
 * matter. 0.5 means a centrist unit turns out at half its general rate.
 */
const PRIMARY_CENTRIST_RETENTION = 0.5;

export interface PartyPositionInput {
  economicPosition: number;
  socialPosition: number;
}

/**
 * Directional-alignment retention for one electorate unit vs a party.
 * Shared by `shiftElectorateForPrimary` (projection) and
 * `applyPrimaryTurnoutRetention` (stagger / polls that already have live
 * GOTV turnouts from `resolveTurnout`).
 */
export function primaryTurnoutRetention(
  economicLean: number,
  socialLean: number,
  partyPosition: PartyPositionInput
): number {
  // |party|² — guarded with max(1, ...) so a perfectly-centrist party (0,0)
  // doesn't divide by zero. In that degenerate case every voter gets zero
  // alignment → floor → uniform near-zero turnout.
  const partyMagSq = Math.max(
    1,
    partyPosition.economicPosition * partyPosition.economicPosition +
      partyPosition.socialPosition * partyPosition.socialPosition
  );
  const alignment =
    (economicLean * partyPosition.economicPosition + socialLean * partyPosition.socialPosition) /
    partyMagSq;
  // Softened curve: aligned voters (alignment>=1) full; centrists 50%;
  // opposed voters drop to the floor. Keeps home-state boost meaningful.
  return Math.max(
    PRIMARY_TURNOUT_FLOOR,
    Math.min(1.0, PRIMARY_CENTRIST_RETENTION + (1 - PRIMARY_CENTRIST_RETENTION) * alignment)
  );
}

/**
 * Directional-alignment scaling: voters WITH the party (same sign, any
 * magnitude) participate fully; centrist voters participate lightly;
 * voters AGAINST the party stay home.
 */
export function shiftElectorateForPrimary(
  electorate: readonly ElectorateUnit[],
  partyPosition: PartyPositionInput
): ElectorateUnit[] {
  return electorate.map((unit) => ({
    ...unit,
    turnout: Math.max(
      0,
      unit.turnout * primaryTurnoutRetention(unit.economicLean, unit.socialLean, partyPosition)
    ),
  }));
}

/**
 * Apply the same primary-electorate retention curve to an already-resolved
 * live turnout map (GOTV / Layer-1 / canvassing).
 *
 * Live turnouts are rebuilt from Layer-1 census baselines and ignore the
 * turnout carried on a unit. If the electorate is shifted for the primary and
 * the Layer-1 `liveTurnouts` are then passed into vote distribution, the
 * primary shift is wiped, and projection (no liveTurnouts) and live results
 * diverge systematically.
 *
 * Call this on the general-electorate live turnouts, then recompute the pool
 * with {@link computeTurnoutPoolFromRates}.
 */
export function applyPrimaryTurnoutRetention(
  turnoutsByUnit: Record<string, number>,
  electorate: readonly ElectorateUnit[],
  partyPosition: PartyPositionInput
): Record<string, number> {
  const unitsById = new Map(electorate.map((unit) => [unit.id, unit]));
  const result: Record<string, number> = {};
  for (const [unitId, turnout] of Object.entries(turnoutsByUnit)) {
    const unit = unitsById.get(unitId);
    if (!unit) {
      result[unitId] = turnout;
      continue;
    }
    const retention = primaryTurnoutRetention(unit.economicLean, unit.socialLean, partyPosition);
    result[unitId] = Math.max(0, turnout * retention);
  }
  return result;
}

/**
 * Recompute the weighted turnout pool from an explicit per-unit turnout map.
 * Mirrors the pool math in the substrate so liveTurnouts and totalPool stay
 * consistent after primary retention is applied.
 */
export function computeTurnoutPoolFromRates(
  statePopulation: number,
  electorate: readonly ElectorateUnit[],
  turnoutsByUnit: Record<string, number>
): number {
  let totalPool = 0;
  for (const unit of electorate) {
    const turnoutPct = turnoutsByUnit[unit.id] ?? 0;
    totalPool += statePopulation * (unit.populationPct / 100) * (turnoutPct / 100);
  }
  return Math.round(totalPool);
}
