import type { ClearingSeller } from "@/lib/market/clearingTypes";

import { LOYAL_POOL_FRACTION, SLICE_NOISE_FLOOR } from "@/lib/market/brandLoyalty";

import { clampPricingPosture } from "@/lib/market/costPlusPricing/rules";

/*
 * Fill one commodity's demand cheapest-first. Sellers at the same posture split
 * residual demand pro-rata. Returns soldFraction per seller id.
 *
 * When `loyaltyById` is supplied, a loyal-slice pre-pass runs first: a finite
 * pool (LOYAL_POOL_FRACTION of demand) is split by relative loyalty and filled
 * at each seller's own price. Omitting it is identical to plain cheapest-first.
 *
 * A supply contract is ADDITIVE, not restrictive: `contractedUnitsById`
 * reserves the buyer's volume off the top, and everything the supplier produces
 * ABOVE the contract clears on the open market, so `soldFraction` reflects real
 * total sales. Contracted volume is guaranteed up to the supplier's offer; do
 * not re-bound it by this pass's anonymous demand.
 */
export function clearCommodityMarket(
  demandUnits: number,
  sellers: readonly ClearingSeller[],
  loyaltyById?: ReadonlyMap<string, number>,
  contractedUnitsById?: ReadonlyMap<string, number>,
  contractedTakeOut?: Map<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  let remaining = Math.max(0, demandUnits);

  // Filled units per seller (reservation + cheapest-first), and units still on
  // offer after the loyal reservation is taken off the top.
  const filledUnits = new Map<string, number>();
  const offerUnits = new Map<string, number>();
  for (const s of sellers) {
    filledUnits.set(s.id, 0);
    offerUnits.set(s.id, Math.max(0, s.units));
  }

  // ── Contracted pre-pass (private supply agreements) ────────────────────────
  // Runs FIRST: contracted units are guaranteed-sold for the supplier and leave
  // the open market (demand is reduced), before loyalty or cheapest-first.
  // Extraction under plants may pass `contractFillUnits` above the nameplate
  // offer: reserve against that plants basis, but never leave nameplate residual
  // that the larger take already consumed (`max(0, offer − take)`).
  if (contractedUnitsById) {
    for (const s of sellers) {
      const contracted = contractedUnitsById.get(s.id) ?? 0;
      if (contracted <= 0) continue;
      const offered = offerUnits.get(s.id) ?? 0;
      const fillBasis =
        typeof s.contractFillUnits === "number" &&
        Number.isFinite(s.contractFillUnits) &&
        s.contractFillUnits >= 0
          ? s.contractFillUnits
          : offered;
      const take = Math.min(contracted, fillBasis);
      if (take <= 0) continue;
      filledUnits.set(s.id, (filledUnits.get(s.id) ?? 0) + take);
      offerUnits.set(s.id, Math.max(0, offered - take));
      contractedTakeOut?.set(s.id, take);
      remaining -= take;
    }
    remaining = Math.max(0, remaining);
  }

  // ── Loyal-slice pre-pass ───────────────────────────────────────────────────
  if (loyaltyById && remaining > 0) {
    // Eligibility and the reservation both read `offerUnits`, not `s.units`, so
    // the contracted pre-pass above is respected (a seller cannot reserve units
    // it has already sold). With no contracts in play `offerUnits === s.units`,
    // so this is byte-identical to the original slice.
    const eligible = sellers.filter(
      (s) => (loyaltyById.get(s.id) ?? 0) >= SLICE_NOISE_FLOOR && (offerUnits.get(s.id) ?? 0) > 0
    );
    const totalLoyalty = eligible.reduce(
      (sum, s) => sum + Math.max(0, loyaltyById.get(s.id) ?? 0),
      0
    );
    if (totalLoyalty > 0) {
      const pool = LOYAL_POOL_FRACTION * remaining;
      for (const s of eligible) {
        const share = pool * (Math.max(0, loyaltyById.get(s.id) ?? 0) / totalLoyalty);
        const available = offerUnits.get(s.id) ?? 0;
        const reserve = Math.min(share, available); // never more than the seller still offers
        filledUnits.set(s.id, (filledUnits.get(s.id) ?? 0) + reserve);
        offerUnits.set(s.id, available - reserve);
        remaining -= reserve;
      }
      remaining = Math.max(0, remaining);
    }
  }

  // ── Cheapest-first over the remaining demand and unreserved units ──────────
  const byPosture = new Map<number, ClearingSeller[]>();
  for (const s of sellers) {
    const p = s.quotedPosture ?? clampPricingPosture(s.posture);
    byPosture.set(p, [...(byPosture.get(p) ?? []), s]);
  }
  for (const posture of [...byPosture.keys()].sort((a, b) => a - b)) {
    const group = byPosture.get(posture)!;
    const groupUnits = group.reduce((sum, s) => sum + (offerUnits.get(s.id) ?? 0), 0);
    const fillFraction = groupUnits <= 0 ? 0 : Math.min(1, remaining / groupUnits);
    for (const s of group) {
      const offered = offerUnits.get(s.id) ?? 0;
      filledUnits.set(s.id, (filledUnits.get(s.id) ?? 0) + offered * fillFraction);
    }
    remaining = Math.max(0, remaining - groupUnits * fillFraction);
  }

  // soldFraction = total filled ÷ original units offered.
  for (const s of sellers) {
    const orig = Math.max(0, s.units);
    result.set(s.id, orig > 0 ? Math.min(1, (filledUnits.get(s.id) ?? 0) / orig) : 0);
  }
  return result;
}
