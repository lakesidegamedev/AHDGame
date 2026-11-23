import { FUNDED_SCARCITY_MAX } from "./scarcityDrift";

/**
 * What the funded price cap is a multiple of: the cap is `multiplier` times the
 * base price carried forward by the shared nominal price index, not the bare
 * base, so goods sitting on it read more than `multiplier` against the original
 * base.
 */
export interface PriceCapBasis {
  multiplier: number;
  nominalIndex: number;
}

/** Same fallbacks the turn clamp applies to a missing or invalid config value. */
export function resolvePriceCapBasis(
  config: { producerPriceMaxMultiplier?: unknown; commodityNominalPriceIndex?: unknown } | null
): PriceCapBasis {
  const m = config?.producerPriceMaxMultiplier;
  const i = config?.commodityNominalPriceIndex;
  return {
    multiplier: typeof m === "number" && Number.isFinite(m) && m >= 1 ? m : FUNDED_SCARCITY_MAX,
    nominalIndex: typeof i === "number" && Number.isFinite(i) && i > 0 ? i : 1,
  };
}

/**
 * Plain-words basis for a price at the cap, e.g.
 * "3x the inflation-adjusted base (base x 1.20 = +260% vs original base)".
 * Null when the basis is not known.
 */
export function priceCapBasisText(basis: PriceCapBasis | null | undefined): string | null {
  if (!basis || !(basis.multiplier > 0) || !(basis.nominalIndex > 0)) return null;
  const mult = Number(basis.multiplier.toFixed(2));
  const index = basis.nominalIndex.toFixed(2);
  const pct = Math.round((basis.multiplier * basis.nominalIndex - 1) * 100);
  return `${mult}x the inflation-adjusted base (base x ${index} = ${pct >= 0 ? "+" : ""}${pct}% vs original base)`;
}
