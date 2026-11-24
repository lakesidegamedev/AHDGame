import { FUNDED_SCARCITY_MAX_MOVE } from "./scarcityDrift";

/** Plain-language reading of the stored price drivers for one commodity. */
export interface ScarcityBreakdown {
  /** Nominal base price: real base plus inflation. */
  nominalBase: number;
  /** Stored scarcity multiplier on the nominal base. */
  scarcityMult: number;
  /** Fractional change since the previous stored turn, null when no prior value. */
  scarcityChange: number | null;
  /** Direction of the last move. */
  direction: "rising" | "easing" | "steady" | "unknown";
  /** Producer input cost multiplier on the scarcity-adjusted base, 1 when none. */
  costPassThrough: number;
  /** Applied price as a multiple of nominal base. */
  priceMultiple: number | null;
  /** Largest share the premium can move in one turn, 0 to 1. */
  maxMovePerTurn: number;
  /** What the premium does now given the stored supply and demand. */
  pressure: "demand-over-supply" | "supply-over-demand" | "balanced" | "unknown";
}

export interface ScarcityBreakdownInput {
  scarcityMult: number | null | undefined;
  previousScarcityMult: number | null | undefined;
  supply: number;
  demand: number;
  attribution: {
    appliedPrice: number;
    realBasePrice: number;
    nominalInflation: number;
    scarcityMemory: number;
    producerInputCostPassThrough: number;
  } | null;
  /** gameConfig.producerPriceMaxMove when set. */
  configuredMaxMove?: number | null;
}

const STEADY_BAND = 0.0005;

export function balancePressure(supply: number, demand: number): ScarcityBreakdown["pressure"] {
  if (!(supply > 0) && !(demand > 0)) return "unknown";
  if (demand > supply * 1.0005) return "demand-over-supply";
  if (supply > demand * 1.0005) return "supply-over-demand";
  return "balanced";
}

export function buildScarcityBreakdown(input: ScarcityBreakdownInput): ScarcityBreakdown | null {
  const { scarcityMult, previousScarcityMult, attribution } = input;
  if (typeof scarcityMult !== "number" || !Number.isFinite(scarcityMult) || !attribution)
    return null;
  const nominalBase = attribution.realBasePrice + attribution.nominalInflation;
  if (!(nominalBase > 0)) return null;
  const scarcityAdjusted = nominalBase + attribution.scarcityMemory;
  const costPassThrough =
    scarcityAdjusted > 0 ? 1 + attribution.producerInputCostPassThrough / scarcityAdjusted : 1;
  const hasPrev =
    typeof previousScarcityMult === "number" &&
    Number.isFinite(previousScarcityMult) &&
    previousScarcityMult > 0;
  const scarcityChange = hasPrev ? scarcityMult / (previousScarcityMult as number) - 1 : null;
  const direction =
    scarcityChange == null
      ? "unknown"
      : scarcityChange > STEADY_BAND
        ? "rising"
        : scarcityChange < -STEADY_BAND
          ? "easing"
          : "steady";
  const maxMove =
    typeof input.configuredMaxMove === "number" &&
    input.configuredMaxMove > 0 &&
    input.configuredMaxMove <= 1
      ? input.configuredMaxMove
      : FUNDED_SCARCITY_MAX_MOVE;
  const pressure = balancePressure(input.supply, input.demand);
  return {
    nominalBase,
    scarcityMult,
    scarcityChange,
    direction,
    costPassThrough,
    priceMultiple: attribution.appliedPrice / nominalBase,
    maxMovePerTurn: maxMove,
    pressure,
  };
}

/** Scarcity multiplier recovered from a stored attribution, null without a usable base. */
export function scarcityMultFromAttribution(
  attribution: { realBasePrice: number; nominalInflation: number; scarcityMemory: number } | null
): number | null {
  if (!attribution) return null;
  const nominal = attribution.realBasePrice + attribution.nominalInflation;
  if (!(nominal > 0)) return null;
  return (nominal + attribution.scarcityMemory) / nominal;
}

/** One plain sentence on what the premium does, from stored supply and demand. */
export function premiumTrendSentence(
  pressure: ScarcityBreakdown["pressure"],
  maxMovePerTurn: number
): string {
  const pct = Math.round(maxMovePerTurn * 1000) / 10;
  if (pressure === "supply-over-demand")
    return `Supply is above demand, so the premium eases by up to ${pct}% a turn until it reaches 1.0x. It does not drop at once.`;
  if (pressure === "demand-over-supply")
    return `Demand is above supply, so the premium rises by up to ${pct}% a turn.`;
  if (pressure === "balanced") return "Supply and demand are level, so the premium holds.";
  return "There is no trade to move the premium.";
}
