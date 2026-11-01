/**
 * Automated ask-price controller: sell-through feedback with hysteresis.
 *
 * An automatic seller should learn from how last turn's ask actually sold. The
 * policy that preceded this one reacted only to total failure (`soldNothingLastTurn`
 * stepped the ceiling down to the clearing price) and otherwise re-derived an ask
 * from last turn's clearing price and its own markup. So a plant that sold every
 * unit it offered had no way to ask for more, and a plant that sold a little kept
 * the price that produced it. Auto pricing could move down but not up, which is
 * why building capacity read as "nothing happens": the seller had no mechanism to
 * convert demand pressure into a higher price.
 *
 * This is the missing loop, as three discrete moves:
 *
 *   sold out            -> raise the ask one step
 *   inside the deadband -> hold the ask
 *   below the floor     -> revert to the ask posted before this raise
 *
 * Reverting to the previous ask rather than to a computed "fair" price is
 * deliberate: it gives back exactly the step that overshot, so the price walks
 * toward the market instead of jumping, and a raise that the book rejects is
 * undone rather than compounded.
 *
 * A deadband between `AUTO_ASK_REVERT_RATIO` and a sell-out holds the price on
 * purpose. Raising on strong-but-not-total sell-through, or cutting on a small
 * shortfall, produces a controller that chases its own noise every turn.
 *
 * Silence is never a signal: no memory, nothing offered, or a non-finite reading
 * all hold instead of moving the price.
 *
 * Pure: plain numbers in, plain numbers out. Deterministic, no clock, no rng.
 */

/** Sold share at or above which the seller asks for more. */
export const AUTO_ASK_SELLOUT_RATIO = 1;

/** Sold share below which the last raise is given back. */
export const AUTO_ASK_REVERT_RATIO = 0.9;

/** Fractional raise applied to a sell-out step when the caller names none. */
export const AUTO_ASK_DEFAULT_STEP = 0.05;

/**
 * Largest fractional raise one turn may apply. A sell-out two turns running
 * compounds, so an uncapped step would let a thin book walk the ask to the
 * policy ceiling in a few turns; the cap keeps the approach gradual.
 */
export const AUTO_ASK_MAX_STEP = 0.25;

/** Tolerance for "sold everything" against fractional unit arithmetic. */
const SELLOUT_EPSILON = 1e-9;

/**
 * The ask posted last turn and the ask posted the turn before it. The second
 * value is the revert target and is what makes a raise undoable.
 */
export interface AutoAskMemory {
  /** Ask posted on the last settled turn, in the book's currency. */
  ask: number;
  /** Ask posted the turn before that, the revert target. */
  previousAsk: number;
}

export type AutoAskAction = "raise" | "hold" | "revert";

export interface AutoAskDecision {
  /** Ask to post this turn, already clamped to the caller's floor and ceiling. */
  ask: number;
  /** What the controller actually did to the price. */
  action: AutoAskAction;
  /** Realized sell-through of the last ask, in [0, 1]; null when nothing was offered. */
  sellThrough: number | null;
}

/**
 * Realized sell-through of an ask in [0, 1], or null when the reading carries no
 * signal. `null` covers a non-finite input and a turn where nothing was offered;
 * both mean "the book said nothing", which the caller must not read as zero sales.
 */
export function sellThroughRatio(soldUnits: number, offeredUnits: number): number | null {
  if (!Number.isFinite(soldUnits) || !Number.isFinite(offeredUnits)) return null;
  if (!(offeredUnits > 0)) return null;
  if (!(soldUnits > 0)) return 0;
  return Math.min(1, soldUnits / offeredUnits);
}

function clampAsk(value: number, floor: number, ceiling: number): number {
  return Math.max(floor, Math.min(ceiling, value));
}

/**
 * Decide this turn's automatic ask from last turn's result.
 *
 * Returns null when there is no usable ask memory, meaning the caller should
 * fall back to its own estimate (first selling turn, or a legacy caller that
 * does not carry memory). Returning null rather than a guess matters: inventing
 * an ask here would silently replace the estimator that the no-memory path uses.
 */
export function nextAutoAsk(input: {
  memory: AutoAskMemory | null | undefined;
  /** Units of this output the last ask actually sold. */
  soldUnits: number;
  /** Units the last ask offered. */
  offeredUnits: number;
  /** Lowest ask the seller may post. Absent = 0. */
  floor?: number;
  /** Highest ask the seller may post. Absent, non-finite or non-positive = unbounded. */
  ceiling?: number;
  /** Fractional raise per sell-out step. Absent = AUTO_ASK_DEFAULT_STEP. */
  step?: number;
}): AutoAskDecision | null {
  const ask =
    input.memory && Number.isFinite(input.memory.ask) && input.memory.ask > 0
      ? input.memory.ask
      : null;
  if (ask === null) return null;

  const floorRaw = input.floor ?? 0;
  const floor = Number.isFinite(floorRaw) && floorRaw > 0 ? floorRaw : 0;
  const ceilingRaw = input.ceiling;
  const ceiling =
    typeof ceilingRaw === "number" && Number.isFinite(ceilingRaw) && ceilingRaw > 0
      ? Math.max(floor, ceilingRaw)
      : Number.POSITIVE_INFINITY;

  const stepRaw = input.step ?? AUTO_ASK_DEFAULT_STEP;
  if (!Number.isFinite(stepRaw) || stepRaw < 0) throw new Error("Invalid auto ask step");
  const step = Math.min(stepRaw, AUTO_ASK_MAX_STEP);

  const last = clampAsk(ask, floor, ceiling);
  const sellThrough = sellThroughRatio(input.soldUnits, input.offeredUnits);

  if (sellThrough === null) return { ask: last, action: "hold", sellThrough: null };

  if (sellThrough >= AUTO_ASK_SELLOUT_RATIO - SELLOUT_EPSILON) {
    const raised = clampAsk(last * (1 + step), floor, ceiling);
    return { ask: raised, action: raised > last ? "raise" : "hold", sellThrough };
  }

  if (sellThrough < AUTO_ASK_REVERT_RATIO) {
    const previous = input.memory?.previousAsk;
    const target =
      typeof previous === "number" && Number.isFinite(previous) && previous > 0 ? previous : last;
    // Never let a revert raise the ask. Corrupt memory or a ceiling that moved
    // since the last turn could put `previousAsk` above the current ask, and a
    // "revert" that raises is the opposite of what the controller intends.
    const reverted = Math.min(last, clampAsk(target, floor, ceiling));
    return { ask: reverted, action: reverted < last ? "revert" : "hold", sellThrough };
  }

  return { ask: last, action: "hold", sellThrough };
}
