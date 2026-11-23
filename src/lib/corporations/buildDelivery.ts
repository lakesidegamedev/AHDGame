/**
 * Per-turn build delivery for the plants tier.
 *
 * Every order with a positive window delivers linearly across
 * `[startTurn, onlineTurn]`: a slice of capacity (and a proportional slice of
 * the paid cost leaving CIP) every turn, instead of landing as one lump or in
 * whole-plant steps. Capacity may be fractional mid-build.
 *
 * The model is a pure function of the order's immutable fields (`startTurn`,
 * `onlineTurn`, `unitsOrdered`, `costPaidAnchor`, optional
 * `deliveryBaseFraction`) and the current turn. Nothing is stored per order
 * about delivery progress, so the turn processor never mutates an in-flight
 * order; it keeps writing only the C4-safe delta (`$pull` fully-landed
 * orders, `$inc` the CIP those turns released). Per-turn slices telescope to
 * exactly `unitsOrdered` by `onlineTurn`.
 *
 * Only a degenerate order with a non-positive window lands all at once.
 */

import type { SectorBuildOrder } from "@/lib/db/types";
import { steppedDeliveredFraction } from "@/lib/corporations/wholePlants/rules";

/** True when the order ramps in across a real window. */
function hasWindow(order: SectorBuildOrder): boolean {
  return order.onlineTurn - order.startTurn > 0;
}

/**
 * An order is on linear delivery once it carries `deliveryBaseFraction` (new
 * orders are placed with 0; the linear-build-delivery migration stamps in-flight ones).
 * Unstamped orders keep their original lump or whole-plant curve, so a turn
 * that runs before the migration never loses or repeats delivered capacity.
 */
function isLinear(order: SectorBuildOrder): boolean {
  return typeof order.deliveryBaseFraction === "number";
}

function legacyFraction(order: SectorBuildOrder, turn: number): number {
  if (!(order.smooth === true && hasWindow(order))) return turn >= order.onlineTurn ? 1 : 0;
  const f = (turn - order.startTurn) / (order.onlineTurn - order.startTurn);
  const linear = f <= 0 ? 0 : f >= 1 ? 1 : f;
  return order.plantUnits != null && order.plantUnits > 0
    ? steppedDeliveredFraction(linear, order.unitsOrdered, order.plantUnits)
    : linear;
}

function baseFraction(order: SectorBuildOrder): number {
  const b = order.deliveryBaseFraction;
  return typeof b === "number" && Number.isFinite(b) ? Math.min(1, Math.max(0, b)) : 0;
}

/**
 * Fraction of the order delivered as of `turn`, in [0, 1]. Linear across the
 * window, starting from `deliveryBaseFraction` for re-anchored in-flight
 * orders. A degenerate window is a step at `onlineTurn`.
 */
export function deliveredFraction(order: SectorBuildOrder, turn: number): number {
  if (!isLinear(order)) return legacyFraction(order, turn);
  if (!hasWindow(order)) return turn >= order.onlineTurn ? 1 : 0;
  const f = (turn - order.startTurn) / (order.onlineTurn - order.startTurn);
  const linear = f <= 0 ? 0 : f >= 1 ? 1 : f;
  const base = baseFraction(order);
  return base + (1 - base) * linear;
}

/**
 * First turn on which any capacity of the order lands, or `onlineTurn` when it
 * lands all at once. Lets player copy name the turn output actually starts.
 */
export function firstDeliveryTurn(order: SectorBuildOrder): number {
  for (let turn = order.startTurn + 1; turn < order.onlineTurn; turn++) {
    if (deliveredFraction(order, turn) > 0) return turn;
  }
  return order.onlineTurn;
}

function safeUnits(order: SectorBuildOrder): number {
  return Number.isFinite(order.unitsOrdered) && order.unitsOrdered > 0 ? order.unitsOrdered : 0;
}

function safeCost(order: SectorBuildOrder): number {
  return Number.isFinite(order.costPaidAnchor) ? Math.max(0, order.costPaidAnchor) : 0;
}

/**
 * Last turn whose build deliveries already landed. Sectors are stamped when
 * deliveries land, so a replayed turn finds its own stamp and delivers
 * nothing twice. Falls back to the world stamp (last turn the corporation
 * turn ran) for unstamped sectors, then to the previous turn. Stamps ahead
 * of currentTurn belong to an older world and are ignored. Economy pauses
 * make "previous turn" unreliable as a fallback.
 */
export function resolveBuildSettledTurn(
  currentTurn: number,
  sectorSettledTurn: number | null | undefined,
  worldSettledTurn: number | null | undefined
): number {
  for (const stamp of [sectorSettledTurn, worldSettledTurn]) {
    if (typeof stamp === "number" && Number.isInteger(stamp) && stamp <= currentTurn) return stamp;
  }
  return currentTurn - 1;
}

/** Share of the order delivered after `settledTurn` up to `currentTurn`. */
function deliveredSlice(order: SectorBuildOrder, settledTurn: number, currentTurn: number): number {
  if (settledTurn >= currentTurn) return 0;
  if (!hasWindow(order) || (!isLinear(order) && order.smooth !== true))
    return currentTurn >= order.onlineTurn ? 1 : 0;
  const slice = deliveredFraction(order, currentTurn) - deliveredFraction(order, settledTurn);
  return slice > 0 ? slice : 0;
}

/**
 * Capacity units this order converts into `capitalStock` for the turns after
 * `settledTurn` up to and including `currentTurn`.
 *
 * Every slice due in that span, so the final slice lands on `onlineTurn`, or
 * on the first turn the build step runs after it. Nothing lands when `settledTurn` is not before `currentTurn`.
 */
export function unitsDeliveredSince(
  order: SectorBuildOrder,
  settledTurn: number,
  currentTurn: number
): number {
  return safeUnits(order) * deliveredSlice(order, settledTurn, currentTurn);
}

/** Paid cost that leaves CIP over the same span: the cost twin of `unitsDeliveredSince`. */
export function costReleasedSince(
  order: SectorBuildOrder,
  settledTurn: number,
  currentTurn: number
): number {
  return safeCost(order) * deliveredSlice(order, settledTurn, currentTurn);
}

/** Capacity units this order converts into `capitalStock` ON `currentTurn` alone. */
export function unitsDeliveredThisTurn(order: SectorBuildOrder, currentTurn: number): number {
  return unitsDeliveredSince(order, currentTurn - 1, currentTurn);
}

/** Paid cost that leaves CIP ON `currentTurn` alone. */
export function costReleasedThisTurn(order: SectorBuildOrder, currentTurn: number): number {
  return costReleasedSince(order, currentTurn - 1, currentTurn);
}

/**
 * Capacity units this order adds each turn of its remaining ramp, or 0 once it
 * has landed or has no real window.
 */
export function steadyUnitsPerTurn(order: SectorBuildOrder, currentTurn: number): number {
  const units = safeUnits(order);
  if (units === 0 || !hasWindow(order) || currentTurn >= order.onlineTurn) return 0;
  if (!isLinear(order)) return 0;
  return (units * (1 - baseFraction(order))) / (order.onlineTurn - order.startTurn);
}

/**
 * First turn after `currentTurn` on which this order adds capacity, or null
 * once it has landed. A ramping order adds capacity every turn, so that is the
 * next turn (or the turn after `startTurn` for an order not yet started).
 */
export function nextArrivalTurn(order: SectorBuildOrder, currentTurn: number): number | null {
  if (safeUnits(order) === 0 || currentTurn >= order.onlineTurn) return null;
  if (!hasWindow(order)) return order.onlineTurn;
  if (!isLinear(order)) {
    for (let turn = Math.max(order.startTurn, currentTurn) + 1; turn < order.onlineTurn; turn++) {
      if (legacyFraction(order, turn) > legacyFraction(order, turn - 1)) return turn;
    }
    return order.onlineTurn;
  }
  return Math.min(order.onlineTurn, Math.max(order.startTurn, currentTurn) + 1);
}

/** Paid cost still under construction (not yet delivered) as of `currentTurn`. */
export function undeliveredCost(order: SectorBuildOrder, currentTurn: number): number {
  return safeCost(order) * (1 - deliveredFraction(order, currentTurn));
}

/** Capacity units still under construction as of `currentTurn`. */
export function undeliveredUnits(order: SectorBuildOrder, currentTurn: number): number {
  return safeUnits(order) * (1 - deliveredFraction(order, currentTurn));
}

/** Sum of `undeliveredCost` across a queue — the sector's true CIP total. */
export function queueUndeliveredCost(queue: SectorBuildOrder[], currentTurn: number): number {
  return queue.reduce((sum, o) => sum + undeliveredCost(o, currentTurn), 0);
}

/** ₳ paid for orders placed on `turn`, whether or not they have started arriving. */
export function orderedOnTurnCost(queue: SectorBuildOrder[], turn: number): number {
  return queue.reduce(
    (sum, o) =>
      o.startTurn === turn && Number.isFinite(o.costPaidAnchor)
        ? sum + Math.max(0, o.costPaidAnchor)
        : sum,
    0
  );
}

/**
 * When a new order would deliver, in turns from the turn it is placed. The
 * first slice lands next turn and the last on `lastInTurns` (the full window).
 */
export function plannedArrivalTurns(
  unitsOrdered: number,
  plantUnits: number,
  buildTurns: number
): { firstInTurns: number; lastInTurns: number } | null {
  if (!(unitsOrdered > 0) || !(plantUnits > 0) || !(buildTurns > 0)) return null;
  return { firstInTurns: 1, lastInTurns: buildTurns };
}
