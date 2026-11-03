/**
 * Why part of an output went unsold last turn (issue #5448).
 *
 * The sector page showed a sold share and nothing else, so a player could not
 * tell a price problem from a demand problem. The settled receipt has the ask
 * and the units; the market outcome has what buyers in that book paid. Their
 * comparison names the cause:
 *
 * - `ask_above_market`: buyers in this book paid less than the ask, so they
 *   bought from cheaper sellers first.
 * - `buyers_covered`: the ask was at or below what buyers paid, yet units were
 *   left: every buyer who would pay that price was already supplied.
 * - `no_buyers`: nothing traded in this book at all.
 *
 * Pure: receipt figures in, a reason out.
 */

export type UnsoldReason = "ask_above_market" | "buyers_covered" | "no_buyers";

export interface UnsoldReading {
  reason: UnsoldReason;
  /** Share of the offer left unsold (0-1). */
  unsoldShare: number;
  askUnitPrice: number;
  /** What buyers in this book paid on average; null when nothing traded. */
  marketUnitPrice: number | null;
}

/** An ask within this share of the market price reads as at the market. */
const PRICE_TOLERANCE = 0.005;
/** Below this unsold share the output reads as sold out. */
const SOLD_OUT_SHARE = 0.01;

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

export function unsoldReason(input: {
  offeredUnits: number;
  soldUnits: number;
  askUnitPrice: number;
  marketUnitPrice: number | null | undefined;
}): UnsoldReading | null {
  const offered = positive(input.offeredUnits);
  if (offered <= 0) return null;
  const sold = Math.min(offered, positive(input.soldUnits));
  const unsoldShare = 1 - sold / offered;
  if (unsoldShare < SOLD_OUT_SHARE) return null;
  const ask = positive(input.askUnitPrice);
  const market = positive(input.marketUnitPrice);
  const marketUnitPrice = market > 0 ? market : null;
  const reason: UnsoldReason =
    marketUnitPrice == null
      ? "no_buyers"
      : ask > marketUnitPrice * (1 + PRICE_TOLERANCE)
        ? "ask_above_market"
        : "buyers_covered";
  return { reason, unsoldShare, askUnitPrice: ask, marketUnitPrice };
}
