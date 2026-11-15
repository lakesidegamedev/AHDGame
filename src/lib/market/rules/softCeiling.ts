/**
 * Soft price ceiling.
 *
 * Above SOFT_CEILING_KNEE of the ceiling, a target price is mapped onto the
 * band below the ceiling: excess decays exponentially, so a deeper shortage
 * reads higher but never reaches the ceiling. Below the knee the price is
 * unchanged. Call this on the target before the pace bound, never on the paced
 * price, or it slides to the knee each turn with demand unchanged.
 *
 * Known limit: discrimination exists between the knee and about twice the
 * ceiling; beyond that targets land within 1% of it.
 *
 * Pure: plain numbers in, a number out.
 */

/** Share of the ceiling above which the soft ceiling starts to compress. */
export const SOFT_CEILING_KNEE = 0.6;

export function softCeiling(price: number, ceiling: number): number {
  if (!(ceiling > 0) || !Number.isFinite(price)) return price;
  const knee = ceiling * SOFT_CEILING_KNEE;
  if (price <= knee) return price;
  const band = ceiling - knee;
  return knee + band * (1 - Math.exp(-(price - knee) / band));
}
