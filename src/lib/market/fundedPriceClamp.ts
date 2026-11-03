/**
 * Funded market price pace, applied to the published price itself.
 *
 * The funded pace (gameConfig.producerPriceMaxMove / producerPriceMaxMultiplier)
 * bounds only the scarcity multiplier. The published price also carries the
 * supply/demand curve on top of it, so a lane with almost no supply could move
 * several times the configured pace in one turn and settle well above the
 * configured ceiling. This clamps the final price to the same pace: at most
 * `maxMove` away from last turn's price, and inside the multiplier band around
 * the nominal base.
 *
 * PURE: plain numbers in, plain number out.
 */
import {
  FUNDED_SCARCITY_MAX,
  FUNDED_SCARCITY_MAX_MOVE,
  FUNDED_SCARCITY_MIN,
} from "./scarcityDrift";
import { softCeiling } from "./rules/softCeiling";

export interface FundedPricePace {
  maxMove?: number;
  maxMultiplier?: number;
  /** Soft ceiling (issue #5448): approach the ceiling gradually instead of pinning on it. */
  softCeiling?: boolean;
}

export function clampFundedPrice(
  next: number,
  previous: number | null | undefined,
  nominalBase: number,
  pace: FundedPricePace = {}
): number {
  if (!Number.isFinite(next)) return next;
  const maxMove =
    typeof pace.maxMove === "number" && pace.maxMove > 0 && pace.maxMove <= 1
      ? pace.maxMove
      : FUNDED_SCARCITY_MAX_MOVE;
  const ceiling =
    typeof pace.maxMultiplier === "number" && pace.maxMultiplier >= 1
      ? pace.maxMultiplier
      : FUNDED_SCARCITY_MAX;
  // Soften the target, not the paced price: softening after the pace bound
  // re-compressed an already softened price every turn, so a capped good with
  // unchanged demand slid toward the knee (about 3.0x to 2.1x base over 60
  // turns). Softened first, the price walks to the soft target and holds there.
  let target = next;
  if (pace.softCeiling && Number.isFinite(nominalBase) && nominalBase > 0)
    target = softCeiling(target, nominalBase * ceiling);
  let price = target;
  if (typeof previous === "number" && Number.isFinite(previous) && previous > 0)
    price = Math.min(previous * (1 + maxMove), Math.max(previous * (1 - maxMove), price));
  if (Number.isFinite(nominalBase) && nominalBase > 0)
    price = Math.min(nominalBase * ceiling, Math.max(nominalBase * FUNDED_SCARCITY_MIN, price));
  return Math.round(price * 100) / 100;
}
