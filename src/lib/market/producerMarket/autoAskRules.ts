/**
 * Automated ask-price controller: sell-through feedback with hysteresis.
 *
 * Three discrete moves:
 *
 *   sold out            -> raise the ask one step
 *   inside the deadband -> hold the ask
 *   below the floor     -> revert to the ask posted before this raise, or
 *                          lower one step when there is no raise to give back
 *
 * Reverting to the previous ask rather than a computed "fair" price is
 * deliberate: it gives back exactly the step that overshot, so the price walks
 * toward the market instead of jumping, and a rejected raise is undone rather
 * than compounded. Once given back, a persistent shortfall keeps lowering the
 * ask one step per turn so the seller is not stuck at a price the book stopped
 * paying.
 *
 * The deadband between `AUTO_ASK_REVERT_RATIO` and a sell-out holds the price
 * on purpose: raising on strong-but-not-total sell-through, or cutting on a
 * small shortfall, makes the controller chase its own noise every turn.
 *
 * Silence is never a signal: no memory, nothing offered, or a non-finite
 * reading all hold instead of moving the price.
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

/**
 * What the controller did. `raise`, `revert` and `lower` are decisions about
 * demand, read from sell-through. `hold` and `clamp` both mean sell-through
 * called for no change; the difference is that `hold` keeps the price and
 * `clamp` moves it. A `clamp` is a floor or ceiling move, not a decision about
 * demand: the anchor fell and pulled the ceiling under the remembered ask, or
 * the floor rose over it. Player-facing text must not describe a clamp as the
 * market asking for a lower or higher price.
 */
export type AutoAskAction = "raise" | "hold" | "revert" | "lower" | "clamp";

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
  /**
   * Fractional raise per sell-out step. Absent, non-finite or negative =
   * AUTO_ASK_DEFAULT_STEP; above AUTO_ASK_MAX_STEP = the cap.
   */
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

  // A bad step can only come from our own config, and this runs inside the turn,
  // where a throw would fail the whole turn for every player. Fall back instead.
  const stepRaw = input.step ?? AUTO_ASK_DEFAULT_STEP;
  const step =
    Number.isFinite(stepRaw) && stepRaw >= 0
      ? Math.min(stepRaw, AUTO_ASK_MAX_STEP)
      : AUTO_ASK_DEFAULT_STEP;

  const last = clampAsk(ask, floor, ceiling);
  const sellThrough = sellThroughRatio(input.soldUnits, input.offeredUnits);

  // A move that only re-applies the floor or ceiling to the remembered ask.
  const settle = (action: AutoAskAction, sold: number | null): AutoAskDecision => ({
    ask: last,
    action: action === "hold" && last !== ask ? "clamp" : action,
    sellThrough: sold,
  });

  if (sellThrough === null) return settle("hold", null);

  if (sellThrough >= AUTO_ASK_SELLOUT_RATIO - SELLOUT_EPSILON) {
    const raised = clampAsk(last * (1 + step), floor, ceiling);
    if (raised > last) return { ask: raised, action: "raise", sellThrough };
    return settle("hold", sellThrough);
  }

  if (sellThrough < AUTO_ASK_REVERT_RATIO) {
    const previous = input.memory?.previousAsk;
    // Give back the last raise when there is one. A previous ask at or above the
    // current one (no raise last turn, a ceiling that moved, or corrupt memory)
    // is not a raise to undo, so step down instead of holding: holding there
    // would freeze a seller whose demand fell away at a price nobody pays.
    const revertable =
      typeof previous === "number" && Number.isFinite(previous) && previous > 0 && previous < last;
    const target = revertable ? previous : last / (1 + step);
    const lowered = clampAsk(target, floor, ceiling);
    if (lowered < last)
      return { ask: lowered, action: revertable ? "revert" : "lower", sellThrough };
    return settle("hold", sellThrough);
  }

  return settle("hold", sellThrough);
}

/**
 * Next turn's memory, given this turn's memory and decision.
 *
 * Only a raise records a revert target: the ask it raised from. Every other
 * move advances `previousAsk` to the new ask, so a later shortfall steps down
 * instead of reverting to a stale price. A raise is undoable once.
 *
 * Silence (no offer) keeps the prior revert target.
 *
 * Memory holds the price the book actually saw: the caller passes `postedAsk`
 * when something moved the price after the controller; a revert target the
 * book never saw would give back a step that never happened.
 */
export function rememberAutoAsk(
  memory: AutoAskMemory,
  decision: AutoAskDecision,
  postedAsk?: number
): AutoAskMemory {
  const posted =
    typeof postedAsk === "number" && Number.isFinite(postedAsk) && postedAsk > 0
      ? postedAsk
      : decision.ask;
  if (decision.action === "raise")
    return { ask: posted, previousAsk: Math.min(memory.ask, posted) };
  if (decision.sellThrough === null) return { ask: posted, previousAsk: memory.previousAsk };
  return { ask: posted, previousAsk: posted };
}
