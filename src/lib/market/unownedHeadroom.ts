/**
 * Unowned-sector headroom units: pure conversion helper. Nothing reads it yet.
 *
 * Unowned sectors currently hold one economic field, `revenue` (₳-native). A
 * later phase reinterprets them as demand-side "market headroom" in commodity
 * units; this module computes that derived value.
 *
 * Conversion mirrors `impliedOutputUnits` in src/lib/market/capital.ts so the
 * unit basis matches corp-side units exactly:
 *
 *     units = Σ_c revenue × supplyRate_c / basePrice_c
 *
 * using the sector type's DEFAULT strategy ("standard", via getStrategy) since
 * unowned sectors carry no strategyId of their own.
 */

import type { OperatingSectorType, MediaDiscriminator } from "@/lib/constants/corporations";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import { getStrategyForOperatingModel } from "@/lib/constants/sectorStrategies";
import { impliedOutputUnits } from "@/lib/market/capital";

/** Strategy id used to resolve an unowned sector's commodity mix (no strategyId field exists on UnownedSector). */
export const UNOWNED_HEADROOM_DEFAULT_STRATEGY_ID = "standard";

/**
 * Convert an unowned sector's ₳ revenue into implied units-of-unmet-demand,
 * using its sector type's default-strategy supply mix. Returns 0 for
 * non-positive/non-finite revenue (matches impliedOutputUnits).
 */
export function computeUnownedHeadroomUnits(
  sectorType: OperatingSectorType,
  revenue: number,
  unitScale: number,
  industryModel?: string | null,
  mediaDiscriminator?: MediaDiscriminator | null
): number {
  return computeSectorImpliedUnits(
    sectorType,
    revenue,
    UNOWNED_HEADROOM_DEFAULT_STRATEGY_ID,
    unitScale,
    industryModel,
    mediaDiscriminator
  );
}

/**
 * Revenue -> implied units on a SPECIFIC strategy's supply mix.
 *
 * Same formula as {@link computeUnownedHeadroomUnits}, but honouring the
 * sector's own `strategyId` instead of forcing "standard". Owned sectors have
 * one; feeding them through the default mix is only correct for sectors that
 * happen to run it.
 *
 * `getStrategy` already falls back to the type's first (standard) strategy for
 * an unknown/absent id, so passing undefined reproduces the default behaviour.
 */
export function computeSectorImpliedUnits(
  sectorType: OperatingSectorType,
  revenue: number,
  strategyId: string | null | undefined,
  unitScale: number,
  industryModel?: string | null,
  mediaDiscriminator?: MediaDiscriminator | null
): number {
  const strategy = getStrategyForOperatingModel(
    sectorType,
    strategyId ?? UNOWNED_HEADROOM_DEFAULT_STRATEGY_ID,
    industryModel,
    mediaDiscriminator
  );
  return impliedOutputUnits(revenue, strategy.supply, COMMODITY_BASE_PRICES, unitScale);
}

/**
 * Units implied by ONE unit of ₳ revenue on the default mix.
 *
 * `impliedOutputUnits` is strictly linear in revenue (Σ revenue x rate / base),
 * so headroom for any positive revenue is `revenue x this`. That lets the
 * derived `headroomUnits` field be maintained inside a Mongo update pipeline
 * (where the JS helper cannot run) without drifting from the helper.
 */
export function unownedHeadroomUnitsPerAnchor(
  sectorType: OperatingSectorType,
  unitScale: number,
  industryModel?: string | null,
  mediaDiscriminator?: MediaDiscriminator | null
): number {
  return computeUnownedHeadroomUnits(sectorType, 1, unitScale, industryModel, mediaDiscriminator);
}

/**
 * The self-healing base expression for `unownedSectors.headroomUnits` inside a
 * Mongo aggregation-pipeline update.
 *
 * `headroomUnits` may be absent from older pool rows that only carry `revenue`.
 * Every pipeline that reads the pool must heal such a row by deriving units
 * from `revenue` rather than falling back to a bare `0`: a `0` fallback turns a
 * drawdown (`$max: [0, base - draw]`) into a TOTAL WIPE of the market's
 * headroom while `revenue` is only decremented by the drawn amount, leaving the
 * two views permanently divergent.
 *
 * Multiple call sites share this one expression to prevent drift.
 */
export function unownedHeadroomBaseExpr(
  sectorType: OperatingSectorType,
  unitScale: number,
  industryModel?: string | null,
  mediaDiscriminator?: MediaDiscriminator | null
): object {
  return {
    $ifNull: [
      "$headroomUnits",
      {
        $multiply: [
          { $ifNull: ["$revenue", 0] },
          unownedHeadroomUnitsPerAnchor(sectorType, unitScale, industryModel, mediaDiscriminator),
        ],
      },
    ],
  };
}

/**
 * Which of a pool row's two legs is AUTHORITATIVE for the current market tier.
 *
 * `revenue` and `headroomUnits` describe one market in two units. Exactly one
 * LEADS: a write applies its delta to the leading leg and RESTATES the other
 * from it (see {@link unownedPoolTrailingSet}). Under plants the units lead
 * (market share divides by units, founding builds draw them down); below plants
 * revenue leads. Getting this backwards is silent and permanent: drawdowns
 * clamp the leading leg at 0 and do NOT push that clamp through the other leg
 * proportionally, so leading with revenue under plants resurrects headroom that
 * expansions consumed. Exported so a call site must state its tier.
 */
export function unownedPoolLeadingField(plantsEnabled: boolean): "headroomUnits" | "revenue" {
  return plantsEnabled ? "headroomUnits" : "revenue";
}

/**
 * The self-healing base to apply a delta ONTO, for whichever leg leads.
 *
 * Under plants this is {@link unownedHeadroomBaseExpr} (units, healing a row
 * that predates the `headroomUnits` backfill from its revenue). Below plants it
 * is the row's own revenue with a `0` default, which is safe there because
 * `revenue` is the field that has always existed.
 */
export function unownedPoolCreditBaseExpr(
  sectorType: OperatingSectorType,
  plantsEnabled: boolean,
  unitScale: number,
  industryModel?: string | null,
  mediaDiscriminator?: MediaDiscriminator | null
) {
  return plantsEnabled
    ? unownedHeadroomBaseExpr(sectorType, unitScale, industryModel, mediaDiscriminator)
    : { $ifNull: ["$revenue", 0] as const };
}

/**
 * FINAL pipeline `$set` stage that restates the TRAILING leg from the leading
 * one, after the leading leg has been written.
 *
 * Must run as its own stage: it reads the post-write value of the leading field,
 * only visible to a later stage. Every pool writer ends with this, so the legs
 * cannot drift:
 *
 *   under plants: revenue = headroomUnits / unitsPerAnchor
 *   below plants: headroomUnits = revenue x unitsPerAnchor
 */
export function unownedPoolTrailingSet(
  sectorType: OperatingSectorType,
  plantsEnabled: boolean,
  unitScale: number,
  industryModel?: string | null,
  mediaDiscriminator?: MediaDiscriminator | null
): object {
  const unitsPerAnchor = unownedHeadroomUnitsPerAnchor(
    sectorType,
    unitScale,
    industryModel,
    mediaDiscriminator
  );
  if (plantsEnabled) {
    const anchorPerUnit = unitsPerAnchor > 0 ? 1 / unitsPerAnchor : 0;
    return { revenue: { $multiply: ["$headroomUnits", anchorPerUnit] } };
  }
  return { headroomUnits: { $multiply: ["$revenue", unitsPerAnchor] } };
}

/**
 * The `$set` stage for a PROPORTIONAL BOOST of one unowned-pool row, shared by the
 * per-turn auto-seeder and the admin `seed-unowned` route.
 *
 * The two legs of a pool row (`revenue`, `headroomUnits`) describe the same market
 * in different units and must never be scaled independently. Which one leads
 * depends on tier:
 *
 *  - BELOW plants: `revenue` leads and `headroomUnits` is re-derived from the
 *    post-boost figure, healing a row that never had the field.
 *  - UNDER plants: `headroomUnits` IS the pool (market share divides by it, founding
 *    builds draw it down), so the boost applies to units and revenue is
 *    reconstructed from them. Re-deriving units from boosted revenue would
 *    resurrect headroom already consumed by expansions.
 *
 * Shared so a caller cannot diverge the two legs.
 */
export function unownedPoolBoostSet(
  sectorType: OperatingSectorType,
  multiplier: number,
  now: Date,
  plantsEnabled: boolean,
  unitScale: number,
  industryModel?: string | null,
  mediaDiscriminator?: MediaDiscriminator | null
): object {
  const unitsPerAnchor = unownedHeadroomUnitsPerAnchor(
    sectorType,
    unitScale,
    industryModel,
    mediaDiscriminator
  );
  const boostedUnits = {
    $multiply: [
      unownedHeadroomBaseExpr(sectorType, unitScale, industryModel, mediaDiscriminator),
      multiplier,
    ],
  };
  if (plantsEnabled) {
    return {
      headroomUnits: boostedUnits,
      revenue:
        unitsPerAnchor > 0
          ? { $round: [{ $divide: [boostedUnits, unitsPerAnchor] }, 0] }
          : "$revenue",
      updatedAt: now,
    };
  }
  const boostedRevenue = { $round: [{ $multiply: ["$revenue", multiplier] }, 0] };
  return {
    revenue: boostedRevenue,
    headroomUnits: { $multiply: [boostedRevenue, unitsPerAnchor] },
    updatedAt: now,
  };
}
