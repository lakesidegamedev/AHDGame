/**
 * Oversupply cut for financial services (ticket 1884, owner decision 2026-11-23).
 *
 * When a whole market is glutted, every producer keeps paying for output that
 * never sells. For financial services the game trims the turn's planned output
 * so world supply lands near what buyers took last turn (times a small margin),
 * and only that good: a plant that also makes software keeps its full software
 * yield.
 *
 * The cut sizes itself every turn and can never cause a shortage:
 * - no cut unless last turn left output unsold, so demand is observed, not capped;
 * - planned supply counts each company's run only as far as its cash covers it,
 *   so a company about to stop for lack of cash does not inflate the estimate;
 * - the target is last turn's sales times OVERSUPPLY_TARGET_RATIO, and the cut
 *   is 1 (none) once planned supply is at or under it.
 *
 * Pure: totals in, a scale in [OVERSUPPLY_MIN_SCALE, 1] out.
 */

import { offtakeUnits, type CaptiveProduct } from "./captiveDeliveryRules";

/** Goods the oversupply cut applies to. */
export const OVERSUPPLY_CUT_COMMODITIES: ReadonlySet<string> = new Set(["financial_services"]);
/** Supply target as a multiple of last turn's sales. */
export const OVERSUPPLY_TARGET_RATIO = 1.05;
/** Sell-through at or above which last turn counts as sold out: demand may be higher, no cut. */
export const OVERSUPPLY_SOLD_OUT = 0.99;
/** Deepest cut in one turn, so a bad estimate can never wipe out a market. */
export const OVERSUPPLY_MIN_SCALE = 0.5;

export interface OversupplyInput {
  /** Last turn's units offered of the good, world-wide. */
  lastOffered: number;
  /** Last turn's units sold of the good, world-wide (own-site deliveries excluded). */
  lastSold: number;
  /** This turn's planned units of the good, each company's run scaled by its cash cover. */
  plannedSupply: number;
}

function finite(x: number): number {
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/** Share of planned output of the good each producer makes this turn: 1 = no cut. */
export function oversupplyScale(input: OversupplyInput): number {
  const offered = finite(input.lastOffered);
  const sold = finite(input.lastSold);
  const planned = finite(input.plannedSupply);
  if (!(offered > 0) || !(sold > 0) || !(planned > 0)) return 1;
  if (sold >= OVERSUPPLY_SOLD_OUT * offered) return 1;
  const target = OVERSUPPLY_TARGET_RATIO * sold;
  if (planned <= target) return 1;
  return Math.max(OVERSUPPLY_MIN_SCALE, target / planned);
}

/**
 * Share of a company's planned run its free cash covers, the same way the
 * settlement scales a run (producerRunBudget): fixed bills first, then the
 * variable need. Inputs are priced at the bid ceiling, so this reads low,
 * which only makes the oversupply cut smaller.
 */
export function cashCoverShare(cash: number, fixedBills: number, variableNeed: number): number {
  const free = (Number.isFinite(cash) ? cash : 0) - finite(fixedBills);
  const need = finite(variableNeed);
  if (!(need > 0)) return 1;
  return Math.max(0, Math.min(1, free / need));
}

/**
 * Whether a plant's last run lost money while leaving output unsold. Own-site
 * deliveries count at their booked value on both sides (valuationCredit for
 * what it sent its sister sites, valuationCharge for what it took from them).
 * Such a plant is not held at a full run just to supply its own sister sites:
 * the normal output rules may cut it, and the sister sites buy any shortfall.
 * A plant that sold everything (a mine feeding its own steel plant) keeps the
 * own-demand floor, even at a loss.
 */
export function lossWithUnsoldOutput(
  receipt:
    | {
        revenue?: number;
        valuationCredit?: number;
        valuationCharge?: number;
        inputsConsumed?: number;
        labourPaid?: number;
        labourArrears?: number;
        otherOperatingPaid?: number;
        otherOperatingArrears?: number;
        idleOperatingCost?: number;
        offeredUnits?: number;
        soldUnits?: number;
        products?: readonly CaptiveProduct[];
      }
    | null
    | undefined
): boolean {
  if (!receipt) return false;
  const n = (x: number | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const offered = n(receipt.offeredUnits);
  // Own-site deliveries are offered but not sold; they are not unsold output.
  if (!(offered > 0) || offtakeUnits(receipt) >= OVERSUPPLY_SOLD_OUT * offered) return false;
  const siteBill = n(receipt.otherOperatingPaid) + n(receipt.otherOperatingArrears);
  const idle = Math.min(siteBill, Math.max(0, n(receipt.idleOperatingCost)));
  const value = n(receipt.revenue) + n(receipt.valuationCredit);
  const cost =
    n(receipt.inputsConsumed) +
    n(receipt.valuationCharge) +
    n(receipt.labourPaid) +
    n(receipt.labourArrears) +
    siteBill -
    idle;
  return value < cost;
}
