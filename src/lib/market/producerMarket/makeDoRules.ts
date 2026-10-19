/**
 * Input shortages in the unified producer market (owner decision 2026-10-19).
 *
 * A plant short of an input makes do: output falls by that input's share of
 * the recipe's input cost times how short its order was filled. Missing 30%
 * of an input that is a fifth of the recipe's input cost cuts output by 6%,
 * not 30%. The cut applies to the plant's original plan using fill rates,
 * which do not depend on scale, so a supply chain with real shortages settles
 * at a proportional cut instead of shrinking itself to nothing, and there is
 * no fixed output floor.
 *
 * Pure: original plan and per-input fill rates in, achievable output out.
 */

export interface MakeDoInput {
  /** Units of this input per unit of output in the recipe. */
  unitsPerOutput: number;
  /** Price weight for the input's share of recipe cost (any consistent unit). */
  unitValue: number;
  /** Share of the plant's need for this input it actually has (0..1). */
  fill: number;
}

export function makeDoOutput(plan: number, inputs: readonly MakeDoInput[]): number {
  if (!(plan > 0)) return 0;
  const used = inputs.filter((i) => i.unitsPerOutput > 0);
  if (used.length === 0) return plan;
  const weights = used.map((i) => Math.max(0, i.unitsPerOutput * Math.max(0, i.unitValue)));
  const total = weights.reduce((a, b) => a + b, 0);
  let cut = 0;
  used.forEach((i, k) => {
    const share = total > 0 ? weights[k] / total : 1 / used.length;
    const fill = Number.isFinite(i.fill) ? Math.max(0, Math.min(1, i.fill)) : 0;
    cut += share * (1 - fill);
  });
  return plan * Math.max(0, 1 - Math.min(1, cut));
}
