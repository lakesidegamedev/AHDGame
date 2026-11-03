/**
 * Smooth (per-turn) build delivery for the plants tier.
 *
 * A capacity build used to be binary: an order sat fully under construction and
 * the WHOLE `unitsOrdered` landed on a single turn (`onlineTurn`). Large orders
 * therefore appeared as one lump. Orders placed with `smooth: true` instead
 * deliver LINEARLY across their build window — a slice of capacity (and a
 * proportional slice of the paid cost leaving CIP) every turn from `startTurn`
 * to `onlineTurn`.
 *
 * The whole model is a PURE FUNCTION of the order's immutable fields
 * (`startTurn`, `onlineTurn`, `unitsOrdered`, `costPaidAnchor`) and the current
 * turn. Nothing is stored per order about how much has been delivered, so the
 * turn processor never has to mutate an in-flight order — it keeps writing only
 * the C4-safe delta (`$pull` the orders that fully landed, `$inc` the CIP those
 * turns released). Capacity accumulates because each turn adds that turn's slice
 * to `capitalStock`, and the per-turn slices telescope to exactly `unitsOrdered`
 * by `onlineTurn`.
 *
 * Legacy orders (no `smooth` flag) and any degenerate order whose window is
 * non-positive keep the old all-at-once behaviour, so this is safe to ship with
 * orders already in flight: they land exactly as they would have.
 */

import type { SectorBuildOrder } from "@/lib/db/types";
import { steppedDeliveredFraction } from "@/lib/corporations/wholePlants/rules";

/** True when the order should ramp in rather than land all at once. */
function isSmooth(order: SectorBuildOrder): boolean {
  return order.smooth === true && order.onlineTurn - order.startTurn > 0;
}

/**
 * Fraction of the order delivered as of `turn`, in [0, 1].
 *
 * Legacy / degenerate orders are a step: 0 until `onlineTurn`, then 1. Smooth
 * orders ramp linearly across `[startTurn, onlineTurn]`. A smooth order
 * stamped with `plantUnits` (whole plants) ramps in whole-plant steps: plant k
 * of p lands on the first turn the linear ramp passes k/p.
 */
export function deliveredFraction(order: SectorBuildOrder, turn: number): number {
  if (!isSmooth(order)) return turn >= order.onlineTurn ? 1 : 0;
  const f = (turn - order.startTurn) / (order.onlineTurn - order.startTurn);
  const linear = f <= 0 ? 0 : f >= 1 ? 1 : f;
  return order.plantUnits != null && order.plantUnits > 0
    ? steppedDeliveredFraction(linear, order.unitsOrdered, order.plantUnits)
    : linear;
}

function safeUnits(order: SectorBuildOrder): number {
  return Number.isFinite(order.unitsOrdered) && order.unitsOrdered > 0 ? order.unitsOrdered : 0;
}

function safeCost(order: SectorBuildOrder): number {
  return Number.isFinite(order.costPaidAnchor) ? Math.max(0, order.costPaidAnchor) : 0;
}

/**
 * Capacity units this order converts into `capitalStock` ON `currentTurn`.
 *
 * Legacy: the whole order the turn it comes due (matching the pre-smooth
 * `landedBuildUnits` sum). Smooth: the slice between the previous turn and this
 * one, so the final slice lands on `onlineTurn`.
 */
export function unitsDeliveredThisTurn(order: SectorBuildOrder, currentTurn: number): number {
  const units = safeUnits(order);
  if (units === 0) return 0;
  if (!isSmooth(order)) return currentTurn >= order.onlineTurn ? units : 0;
  const slice = deliveredFraction(order, currentTurn) - deliveredFraction(order, currentTurn - 1);
  return slice > 0 ? units * slice : 0;
}

/**
 * Paid cost (anchor) that leaves CIP and becomes a booked plant ON
 * `currentTurn` — the cost twin of `unitsDeliveredThisTurn`.
 */
export function costReleasedThisTurn(order: SectorBuildOrder, currentTurn: number): number {
  const cost = safeCost(order);
  if (cost === 0) return 0;
  if (!isSmooth(order)) return currentTurn >= order.onlineTurn ? cost : 0;
  const slice = deliveredFraction(order, currentTurn) - deliveredFraction(order, currentTurn - 1);
  return slice > 0 ? cost * slice : 0;
}

/**
 * Average capacity units this order adds per turn of its ramp, or 0 when it
 * does not add capacity on every turn.
 *
 * A linear smooth order adds exactly `unitsOrdered / window` each turn. A
 * whole-plant order adds whole plants, so it only has a per-turn rate when at
 * least one plant lands each turn, and then the rate is an average of lumpy
 * steps. With fewer plants than turns it lands in steps with empty turns
 * between, and an order under one plant lands in one piece on its online turn;
 * quoting "about 0.1 a turn" for that described capacity that never arrives
 * that way (ticket 1753). Legacy orders land all at once and have no rate
 * either. Use `nextArrivalTurn` to say when a stepped order next lands.
 */
export function steadyUnitsPerTurn(order: SectorBuildOrder, currentTurn: number): number {
  const units = safeUnits(order);
  if (units === 0 || !isSmooth(order) || currentTurn >= order.onlineTurn) return 0;
  const window = order.onlineTurn - order.startTurn;
  if (order.plantUnits != null && order.plantUnits > 0) {
    // The same plant count steppedDeliveredFraction ramps through.
    const plants = Math.max(1, Math.round(units / order.plantUnits));
    if (plants < window) return 0;
  }
  return units / window;
}

/**
 * First turn after `currentTurn` on which this order adds capacity, or null
 * once it has landed. A legacy order lands on its online turn; a whole-plant
 * order on the turn its next plant steps in, which can be well before the
 * online turn (two plants over six turns land at the midpoint and the end).
 */
export function nextArrivalTurn(order: SectorBuildOrder, currentTurn: number): number | null {
  if (safeUnits(order) === 0 || currentTurn >= order.onlineTurn) return null;
  if (!isSmooth(order)) return order.onlineTurn;
  for (let turn = Math.max(order.startTurn, currentTurn) + 1; turn < order.onlineTurn; turn++) {
    if (unitsDeliveredThisTurn(order, turn) > 0) return turn;
  }
  return order.onlineTurn;
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
