import { STRATEGY_TRANSITION_TURNS } from "@/lib/constants/sectorStrategies";
import { SHORTAGE_RETOOL_TRANSITION_HEADSTART } from "@/lib/corporations/shortageRetool";
/** One retool price in anchor units, shared by the command and its decision display. */
export function retoolQuote(input: {
  revenueAnchor: number;
  baseFraction: number;
  multiplier: number;
  downsideFraction: number;
  freeConversion: boolean;
  shortageDiscount: boolean;
  foreignSpreadRate: number;
}) {
  const values = [
    input.revenueAnchor,
    input.baseFraction,
    input.multiplier,
    input.downsideFraction,
    input.foreignSpreadRate,
  ];
  if (!values.every((n) => Number.isFinite(n) && n >= 0))
    throw new Error("Retool pricing inputs are unavailable");
  const baseRetoolCost =
    input.freeConversion || input.shortageDiscount
      ? 0
      : input.revenueAnchor * input.baseFraction * input.multiplier;
  const downsideCharge = input.revenueAnchor * input.downsideFraction;
  const foreignSpread = (baseRetoolCost + downsideCharge) * input.foreignSpreadRate;
  const retoolCost = baseRetoolCost + downsideCharge + foreignSpread;
  if (!Number.isFinite(retoolCost)) throw new Error("Retool quote is out of range");
  return {
    retoolCost,
    baseRetoolCost,
    downsideCharge,
    foreignSpread,
    retoolCostMultiplier: input.multiplier,
    freeConversion: input.freeConversion,
    shortageDiscount: input.shortageDiscount,
    transitionTurns: input.shortageDiscount
      ? Math.max(0, STRATEGY_TRANSITION_TURNS - SHORTAGE_RETOOL_TRANSITION_HEADSTART)
      : STRATEGY_TRANSITION_TURNS,
  };
}
export type RetoolQuote = ReturnType<typeof retoolQuote>;

/** Accept only a complete priced response; never substitute a client-side estimate. */
export function readRetoolQuote(value: unknown): RetoolQuote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  for (const key of [
    "retoolCost",
    "baseRetoolCost",
    "downsideCharge",
    "foreignSpread",
    "retoolCostMultiplier",
    "transitionTurns",
  ])
    if (typeof row[key] !== "number" || !Number.isFinite(row[key]) || row[key] < 0) return null;
  if (typeof row.freeConversion !== "boolean" || typeof row.shortageDiscount !== "boolean")
    return null;
  return row as RetoolQuote;
}
