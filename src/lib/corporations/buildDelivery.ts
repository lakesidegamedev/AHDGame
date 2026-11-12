/**
 * Smooth (per-turn) build delivery for the plants tier.
 *
 * Orders placed with `smooth: true` deliver linearly across their build window: a
 * slice of capacity (and a proportional slice of the paid cost leaving CIP) every
 * turn from `startTurn` to `onlineTurn`, instead of landing as one lump.
 *
 * The model is a pure function of the order's immutable fields (`startTurn`,
 * `onlineTurn`, `unitsOrdered`, `costPaidAnchor`) and the current turn. Nothing is
 * stored per order about delivery progress, so the turn processor never mutates an
 * in-flight order; it keeps writing only the C4-safe delta (`$pull` fully-landed
 * orders, `$inc` the CIP those turns released). Per-turn slices telescope to
 * exactly `unitsOrdered` by `onlineTurn`.
 *
 * Legacy orders (no `smooth` flag) and degenerate orders with a non-positive
 * window keep the all-at-once behaviour, so in-flight orders land unchanged.
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
  if (!isSmooth(order)) return currentTurn >= order.onlineTurn ? 1 : 0;
  const slice = deliveredFraction(order, currentTurn) - deliveredFraction(order, settledTurn);
  return slice > 0 ? slice : 0;
}

/**
 * Capacity units this order converts into `capitalStock` for the turns after
 * `settledTurn` up to and including `currentTurn`.
 *
 * Legacy: the whole order once it has come due (matching the pre-smooth
 * `landedBuildUnits` sum). Smooth: every slice due in that span, so the final
 * slice lands on `onlineTurn`, or on the first turn the build step runs after
 * it. Nothing lands when `settledTurn` is not before `currentTurn`.
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
 * Average capacity units this order adds per turn of its ramp, or 0 when it
 * does not add capacity on every turn.
 *
 * A linear smooth order adds exactly `unitsOrdered / window` each turn. A
 * whole-plant order only has a per-turn rate when at least one plant lands per
 * turn, and then it is an average of lumpy steps. With fewer plants than turns
 * it lands in steps with empty turns between; an order under one plant lands in
 * one piece on its online turn, so it has no steady rate. Legacy orders land all
 * at once and have no rate either. Use `nextArrivalTurn` to say when a stepped
 * order next lands.
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
