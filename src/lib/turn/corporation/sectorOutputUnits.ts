/**
 * Units telemetry: the units-denominated twin of the dollar realization chain.
 *
 * Dollar chain: realizedRevenue = nameplateRevenue × productionLegs × salesLegs
 * where production legs gate physical output and sales legs decide clearing
 * and price.
 *
 * The identity pinned here:
 *   producedUnits   = impliedOutputUnits(nameplateRevenue) × productionFactor
 *   realizedRevenue = producedUnits × mixPrice × salesLegs
 * with mixPrice = nameplateRevenue / impliedOutputUnits(nameplateRevenue).
 * Both are DAILY, currency-free counts.
 *
 * `soldUnits` = producedUnits × soldFraction when the clearing pre-pass ran,
 * else producedUnits. The embargo leg is NOT folded in: it strips revenue, not
 * clearing volume, and stays on the dollar side.
 *
 * Telemetry only: never read back into the economy.
 */
export function computeSectorOutputUnits(args: {
  /** impliedOutputUnits of the sector's nameplate (pre-realization) revenue. */
  nameplateUnits: number;
  /** Product of the production-side legs of the realization chain. */
  productionFactor: number;
  /** clearing.soldFraction when the clearing pre-pass ran, else null. */
  soldFraction: number | null;
}): { producedUnits: number; soldUnits: number } {
  const { nameplateUnits, productionFactor, soldFraction } = args;
  const producedUnits =
    Number.isFinite(nameplateUnits) && Number.isFinite(productionFactor)
      ? Math.max(0, nameplateUnits * productionFactor)
      : 0;
  const soldUnits =
    soldFraction != null && Number.isFinite(soldFraction)
      ? producedUnits * Math.max(0, soldFraction)
      : producedUnits;
  return { producedUnits, soldUnits };
}
