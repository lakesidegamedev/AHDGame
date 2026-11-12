/**
 * Apply a cross-country trust delta after a sovereign default.
 *
 * Deltas arrive in the LEGACY 0..100 unit and are scaled to design-fractional
 * trust. Board countries take the hit on `governance.integrity` (mapped by
 * ADAPTER_TIER1 to `governance.publicTrust`) via the same scale conversion the
 * legislation bridge uses.
 *
 * Shifts the VALUE, not the residual: the dynamics phase drifts value back to
 * its law-implied target, so an event's damage decays. Shifting the residual
 * would move the equilibrium and act like enacted law instead of an event.
 *
 * Writes through `applyBoardDelta`; a dotted `$inc` silently does nothing.
 */

import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { Filter } from "mongodb";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import { boardDeltaForLegacyEffect } from "@/lib/politicalLegislation/legacyEffectBridge";
import { applyBoardDelta } from "@/lib/politicalLegislation/boardWrite";

/**
 * Move public trust by a delta expressed in the LEGACY 0-100 unit.
 *
 * The shared entry point for every "an event damaged (or restored) trust"
 * caller — sovereign default, debt penalties, civil unrest. They all used to
 * `$inc` `governance.publicTrust` on a store no country has any more, so they
 * had all silently become no-ops.
 */
export async function applyLegacyTrustDelta(
  db: Db,
  countryId: CountryId,
  legacyDelta: number
): Promise<{ statesUpdated: number }> {
  const hit = boardDeltaForLegacyEffect("governance", "publicTrust", legacyDelta);
  if (!hit) return { statesUpdated: 0 };
  const { regionsUpdated } = await applyBoardDelta(
    db,
    { countryId } as Filter<PoliticalMetricsDoc>,
    hit.familyId,
    hit.scoreDelta,
    "value"
  );
  return { statesUpdated: regionsUpdated };
}

/** Sovereign-default entry point: trust is design-fractional (0..1) there. */
export async function applyCrossCountryTrustHit(
  db: Db,
  countryId: CountryId,
  fractionalDelta: number
): Promise<{ statesUpdated: number }> {
  return applyLegacyTrustDelta(db, countryId, fractionalDelta * 100);
}
