/**
 * Evidence gates on an existing plant's growth leg, for NPP and autopilot
 * reinvestment. Plain data in, plain data out: no clock, rng or ambient state.
 *
 * Either gate refuses the growth leg only; replacement of worn capacity still
 * goes through.
 */

import { NPP_GROWTH_MIN_THROTTLE } from "../nppCorporationTuning";
import { nppDemandThrottle, type DemandReadingSectorLike } from "./fundedSellThrough";
import { inputCutRunShare, isInputStarved, type InputRunReceiptLike } from "./inputAvailability";

export type GrowthEvidenceGate = "growth_throttled_market" | "growth_inputs_starved";

export interface GrowthEvidenceSectorLike extends DemandReadingSectorLike {
  producerSettlement?: (DemandReadingSectorLike["producerSettlement"] & InputRunReceiptLike) | null;
}

/** First evidence gate that refuses this plant's growth leg, or null. */
export function growthEvidenceGate(
  sector: GrowthEvidenceSectorLike,
  args: { autopilot: boolean; fundedWorldEpoch: string | null | undefined }
): GrowthEvidenceGate | null {
  // NPP-run plants do not add growth where the market already throttles
  // them. On a funded world the reading is sell-through, so a plant held down
  // by missing inputs while selling all it makes is not a throttled market.
  const demandReading = nppDemandThrottle(sector, args.fundedWorldEpoch);
  if (!args.autopilot && demandReading != null && demandReading < NPP_GROWTH_MIN_THROTTLE) {
    return "growth_throttled_market";
  }
  // Neither an NPP nor autopilot adds capacity a plant cannot feed: last turn
  // short inputs cut its run below half (rules/inputAvailability). More plant
  // would sit idle and deepen the shortage starving it.
  if (isInputStarved(inputCutRunShare(sector.producerSettlement, args.fundedWorldEpoch))) {
    return "growth_inputs_starved";
  }
  return null;
}
