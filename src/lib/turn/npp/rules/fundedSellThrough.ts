/**
 * The demand reading NPP decisions use for one plant, on either market path.
 *
 * Plain data in, plain data out: no clock, rng or ambient state.
 *
 * On a legacy world `demandThrottleFactor` is the share of capacity the
 * clearing pass let the plant run because buyers would take no more: below 1
 * means unsold demand room ran out, a glut signal.
 *
 * The funded producer market writes the same field as sold / capacity
 * (`fundedDemandThrottle`). That mixes two different causes of low output: a
 * plant whose buyers stopped taking its goods, and a plant that could not make
 * its goods because inputs or cash ran short. A farm without fertilizer runs at
 * a quarter of nameplate and sells every unit, yet reads 0.25. Read as a glut,
 * that holds back growth and entry in exactly the markets that are short.
 *
 * On a funded world the reading is therefore sell-through from the plant's
 * latest settlement receipt: units sold over units offered (this turn's output
 * plus stock put up for sale). 1 means every offered unit found a buyer, so the
 * market took all the plant could bring; under 1 means output went unsold.
 */

import { TURNS_PER_DAY } from "@/lib/constants/corporationsClient";

/** The parts of a funded settlement receipt this reading uses. */
export interface FundedReceiptLike {
  worldEpoch?: string | null;
  capacityUnits?: number | null;
  offeredUnits?: number | null;
  soldUnits?: number | null;
}

export interface DemandReadingSectorLike {
  demandThrottleFactor?: number | null;
  operatingCapacityUnits?: number | null;
  producerSettlement?: FundedReceiptLike | null;
}

function finiteOrNull(x: number | null | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** The sector's settlement receipt when it belongs to the given funded world. */
function currentReceipt(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string
): FundedReceiptLike | null {
  const r = sector.producerSettlement;
  return r && r.worldEpoch === fundedWorldEpoch ? r : null;
}

/**
 * Sold over offered from the sector's receipt in this funded world, clamped to
 * [0, 1]. Null without a receipt or when nothing was offered: a plant that made
 * and held nothing gives no evidence about demand either way.
 */
export function fundedSellThrough(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string
): number | null {
  const r = currentReceipt(sector, fundedWorldEpoch);
  if (!r) return null;
  const offered = finiteOrNull(r.offeredUnits);
  if (offered == null || !(offered > 0)) return null;
  const sold = Math.max(0, finiteOrNull(r.soldUnits) ?? 0);
  return Math.max(0, Math.min(1, sold / offered));
}

/**
 * The demand-glut reading for NPP growth, saturation and mothball decisions:
 * funded sell-through on a funded world, the legacy throttle otherwise. Null
 * means no reading, which never blocks.
 */
export function nppDemandThrottle(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string | null | undefined
): number | null {
  if (fundedWorldEpoch) return fundedSellThrough(sector, fundedWorldEpoch);
  return finiteOrNull(sector.demandThrottleFactor);
}

/**
 * Daily capacity basis for utilization. On a funded world the receipt's
 * per-turn capacity is the settled one; the legacy field is written by a pass
 * that does not price the funded market. Null when no reading applies.
 */
export function nppOperatingCapacityUnits(
  sector: DemandReadingSectorLike,
  fundedWorldEpoch: string | null | undefined
): number | null {
  if (fundedWorldEpoch) {
    const capacity = finiteOrNull(currentReceipt(sector, fundedWorldEpoch)?.capacityUnits);
    return capacity != null && capacity > 0 ? capacity * TURNS_PER_DAY : null;
  }
  return finiteOrNull(sector.operatingCapacityUnits);
}
