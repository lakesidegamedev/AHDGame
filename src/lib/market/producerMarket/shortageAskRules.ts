/**
 * Shortage ask step (gameConfig.producerShortageAskStage).
 *
 * An automatic seller posts last turn's clearing price for its lane, and the
 * clearing is the average of what traded. Nothing in that loop can raise a
 * price: one cheap seller pulls the average down, every automatic seller
 * follows it next turn, and the lane stays there even when buyers go short.
 * On the live world (turn 673) iron cleared at 0.21x its reference with 34%
 * of orders unfilled, natural gas at 0.15x with half unfilled, and most plants
 * in both books cost more to run than the price, so the loss brake kept
 * cutting the supply the buyers were missing.
 *
 * Here a seller that sold out last turn, in a lane where buyers asked for more
 * than they got, asks one step above the clearing. The step grows with the
 * unfilled share and is capped per turn, and the ask never passes the price
 * ceiling (reference x maximum multiplier). A lane that clears in full gets no
 * step, so the price holds; a seller with stock left over gets no step, so a
 * raise the book rejected is not repeated, and the stock-cover markdown still
 * applies to it.
 *
 * Pure: last turn's clearing, reference, pressure and sell-out in, an ask out.
 */

/** Default largest raise in one turn. */
export const SHORTAGE_ASK_DEFAULT_MAX_STEP = 0.05;
/** Step per unit of excess pressure (requested / delivered - 1), before the cap. */
export const SHORTAGE_ASK_GAIN = 0.25;
/** Default ceiling as a multiple of the reference price. */
export const SHORTAGE_ASK_DEFAULT_MAX_MULTIPLIER = 3;
/** Requested / delivered at or below this reads as cleared: no step. */
const CLEARED_PRESSURE = 1.02;

export interface ShortageAskInput {
  /** Last turn's clearing price on this lane. */
  clearingUnitPrice: number;
  /** The output's reference price. */
  referenceUnitPrice: number;
  /** Requested / delivered on this lane last turn (bookPressure); absent = no reading. */
  pressure: number | undefined;
  /** The seller sold all it offered on this line last turn and has nothing left over. */
  soldOut: boolean;
  /** Largest raise in one turn, as a fraction. */
  maxStep?: number;
  /** Ceiling as a multiple of the reference price. */
  maxMultiplier?: number;
}

/** The step this seller may take: 0 unless it sold out into a lane that went short. */
export function shortageAskStep(
  input: Omit<ShortageAskInput, "clearingUnitPrice" | "referenceUnitPrice">
): number {
  const p = input.pressure;
  if (!input.soldOut || typeof p !== "number" || !Number.isFinite(p) || !(p > CLEARED_PRESSURE))
    return 0;
  const cap =
    typeof input.maxStep === "number" && input.maxStep > 0 && input.maxStep <= 1
      ? input.maxStep
      : SHORTAGE_ASK_DEFAULT_MAX_STEP;
  return Math.min(cap, SHORTAGE_ASK_GAIN * (p - 1));
}

/** The ask: the clearing, raised by the step, never past the ceiling and never below the clearing. */
export function shortageAsk(input: ShortageAskInput): number {
  const clearing = input.clearingUnitPrice;
  if (!(Number.isFinite(clearing) && clearing > 0)) return clearing;
  const step = shortageAskStep(input);
  if (!(step > 0)) return clearing;
  const multiplier =
    typeof input.maxMultiplier === "number" && input.maxMultiplier >= 1
      ? input.maxMultiplier
      : SHORTAGE_ASK_DEFAULT_MAX_MULTIPLIER;
  const reference = input.referenceUnitPrice;
  const ceiling =
    Number.isFinite(reference) && reference > 0 ? reference * multiplier : Number.POSITIVE_INFINITY;
  if (clearing >= ceiling) return clearing;
  return Math.min(ceiling, clearing * (1 + step));
}
