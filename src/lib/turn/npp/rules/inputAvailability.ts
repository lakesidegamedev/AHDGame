/**
 * Input availability for AI capacity decisions (NPP brain and player autopilot).
 *
 * Plain data in, plain data out: no clock, rng or ambient state.
 *
 * A plant runs at the fill rate of its scarcest input (market/throughput, and
 * the funded producer market's run cut). Founding and growth used to read only
 * prices, so a short output pulled capacity in even when the plant could not
 * buy what it needs to run: a farm founded into a fertilizer shortage makes a
 * fraction of nameplate, pays for idle plant, and deepens the fertilizer
 * shortage it is starved by. The price of a starved input caps out near the
 * scarcity ceiling, so the price score cannot see the difference between an
 * input that is dear and one that is barely on the market at all.
 *
 * These rules read the same lagged per-state delivery fill the corporation
 * turn throttles against (`commodityPrices.stateInputAvailability`).
 */

import type { CommodityType } from "@/lib/constants/commodities";

/**
 * Below this expected fill of its scarcest input, an AI does not found a plant
 * or grow one. Matches THROUGHPUT_MIN: a plant that cannot run at half of
 * nameplate is idle capital whatever its output sells for.
 */
export const AI_MIN_INPUT_AVAILABILITY = 0.5;

/** Delivered share of an input's demand in a state last turn; null when unknown. */
export type StateInputAvailabilityOf = (commodity: CommodityType, stateId: string) => number | null;

/**
 * Expected fill of a recipe's scarcest input in a state, in [0, 1]. Inputs with
 * no reading count as fully available, as they do in the throughput coupling.
 */
export function recipeInputAvailability(
  demand: Partial<Record<CommodityType, number>> | undefined,
  stateId: string,
  availabilityOf: StateInputAvailabilityOf
): number {
  let min = 1;
  for (const [commodity, rate] of Object.entries(demand ?? {})) {
    if (!(typeof rate === "number" && rate > 0)) continue;
    const fill = availabilityOf(commodity as CommodityType, stateId);
    if (fill == null || !Number.isFinite(fill)) continue;
    min = Math.min(min, Math.max(0, fill));
  }
  return min;
}

/** Whether an expected input fill is too low to found or grow on. Null never blocks. */
export function isInputStarved(availability: number | null | undefined): boolean {
  return (
    typeof availability === "number" &&
    Number.isFinite(availability) &&
    availability < AI_MIN_INPUT_AVAILABILITY
  );
}

/** The parts of a funded settlement receipt the growth reading uses. */
export interface InputRunReceiptLike {
  worldEpoch?: string | null;
  billedRunShare?: number | null;
  runCutBy?: readonly string[] | null;
}

/**
 * Share of its funded run an operating plant actually made last turn when
 * short inputs cut it; null when inputs did not bind or there is no receipt
 * for this funded world. Cash cuts are a separate problem the growth budget
 * already sees.
 */
export function inputCutRunShare(
  receipt: InputRunReceiptLike | null | undefined,
  fundedWorldEpoch: string | null | undefined
): number | null {
  if (!receipt || !fundedWorldEpoch || receipt.worldEpoch !== fundedWorldEpoch) return null;
  if (!receipt.runCutBy?.includes("inputs")) return null;
  const share = receipt.billedRunShare;
  return typeof share === "number" && Number.isFinite(share)
    ? Math.max(0, Math.min(1, share))
    : null;
}
