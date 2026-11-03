/**
 * Soft price ceiling (#5452, stage `producerSoftPriceCeilingStage`).
 *
 * Most short goods sat exactly on the funded ceiling and moved together, so the
 * price said nothing about how short a good was. Above SOFT_CEILING_KNEE of the
 * ceiling a target price is mapped onto the band below the ceiling: the excess
 * decays exponentially, so a deeper shortage still reads higher but never
 * reaches the ceiling itself. Below the knee the price is unchanged.
 *
 * The caller softens the target before its per-turn pace bound, never the
 * paced price: softening a paced price again every turn slides it toward the
 * knee with demand unchanged.
 *
 * Known limit (open on #5452): discrimination exists between the knee and about
 * twice the ceiling; targets beyond that land within 1% of it. A target at the
 * ceiling softens to 1 - (1 - knee) / e of it (85.3% at knee 0.6).
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
