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
 * A minor input (a small share of the recipe's input cost) does not cut
 * output at all: the plant improvises the missing units and pays a premium for
 * them instead (minorInputShortfallCost). A plant whose only shortage is a
 * trace of local services runs its plan.
 *
 * Pure: original plan and per-input fill rates in, achievable output out.
 */

/** An input at or below this share of the recipe's input cost per unit is minor. */
export const MINOR_INPUT_COST_SHARE = 0.05;
/** Missing units of a minor input cost this multiple of the plant's bid limit. */
export const MINOR_INPUT_SHORTFALL_PREMIUM = 2;

export interface RecipeInputCost {
  /** Units of this input per unit of output in the recipe. */
  unitsPerOutput: number;
  /** Price weight for the input's share of recipe cost (any consistent unit). */
  unitValue: number;
}

/**
 * Which inputs are minor: each input's share of the recipe's input cost per
 * unit of output, against MINOR_INPUT_COST_SHARE. An unpriced recipe has no
 * minor inputs, and an input with no use in the recipe is never minor.
 */
export function minorInputs(inputs: readonly RecipeInputCost[]): boolean[] {
  const weights = inputs.map((i) =>
    i.unitsPerOutput > 0 ? i.unitsPerOutput * Math.max(0, i.unitValue) : 0
  );
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0) || !Number.isFinite(total)) return inputs.map(() => false);
  return inputs.map((i, k) => i.unitsPerOutput > 0 && weights[k] / total <= MINOR_INPUT_COST_SHARE);
}

/**
 * What a plant pays for the units of a minor input it made without: the
 * shortfall at its bid limit times MINOR_INPUT_SHORTFALL_PREMIUM.
 */
export function minorInputShortfallCost(input: {
  produced: number;
  unitsPerOutput: number;
  available: number;
  maximumUnitPrice: number;
}): number {
  const missing = Math.max(
    0,
    Math.max(0, input.produced) * Math.max(0, input.unitsPerOutput) - Math.max(0, input.available)
  );
  const cost = missing * Math.max(0, input.maximumUnitPrice) * MINOR_INPUT_SHORTFALL_PREMIUM;
  return Number.isFinite(cost) ? cost : 0;
}

export interface MakeDoInput extends RecipeInputCost {
  /** Share of the plant's need for this input it actually has (0..1). */
  fill: number;
}

export function makeDoOutput(plan: number, inputs: readonly MakeDoInput[]): number {
  if (!(plan > 0)) return 0;
  const used = inputs.filter((i) => i.unitsPerOutput > 0);
  if (used.length === 0) return plan;
  const weights = used.map((i) => Math.max(0, i.unitsPerOutput * Math.max(0, i.unitValue)));
  const total = weights.reduce((a, b) => a + b, 0);
  const minor = minorInputs(used);
  let cut = 0;
  used.forEach((i, k) => {
    if (minor[k]) return;
    const share = total > 0 ? weights[k] / total : 1 / used.length;
    const fill = Number.isFinite(i.fill) ? Math.max(0, Math.min(1, i.fill)) : 0;
    cut += share * (1 - fill);
  });
  return plan * Math.max(0, 1 - Math.min(1, cut));
}
