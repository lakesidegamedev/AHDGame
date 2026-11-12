/**
 * Shortage ask step (gameConfig.producerShortageAskStage).
 *
 * Automatic sellers post last turn's clearing price, which is the average of what
 * traded. That loop cannot raise a price: one cheap seller drags the average down
 * and every automatic seller follows, leaving a lane short even when buyers go
 * unfilled.
 *
 * Here a seller that sold out last turn in a lane with unfilled demand asks one
 * step above the clearing. The step grows with unfilled share, is capped per turn,
 * and never passes the price ceiling. A fully-cleared lane gets no step, and a
 * seller with leftover stock gets no step so rejected raises are not repeated.
 *
 * Pure: last clearing, reference, pressure and sell-out in, an ask out.
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
  /**
   * This seller's own ask on the lane last turn (producerShortageAskStage >= 2).
   * A sold-out seller steps from the higher of it and the clearing, so one
   * cheap seller's volume in the average cannot hold every raise to a sliver.
   */
  ownAskUnitPrice?: number;
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
  const cleared = input.clearingUnitPrice;
  if (!(Number.isFinite(cleared) && cleared > 0)) return cleared;
  const step = shortageAskStep(input);
  if (!(step > 0)) return cleared;
  // On turn 701 one company sold 36% of world ordnance at 0.88x the clearing while
  // every other seller sold out at 1.1x, so the average and every anchor rose about
  // 2% a turn with buyers 89% unfilled. A seller that sold out at its own ask
  // steps from that ask.
  const own = input.ownAskUnitPrice;
  const clearing = typeof own === "number" && Number.isFinite(own) && own > cleared ? own : cleared;
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
