/**
 * Oversupply cut: when a good is glutted, trim planned output so world supply
 * sits just above what buyers took last turn. Sized afresh each turn; no cut
 * after a sold-out turn, and cash-starved companies do not count as supply.
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

/** Share of a company's run its free cash covers, as the settlement scales it; reads low. */
export function cashCoverShare(cash: number, fixedBills: number, variableNeed: number): number {
  const free = (Number.isFinite(cash) ? cash : 0) - finite(fixedBills);
  const need = finite(variableNeed);
  if (!(need > 0)) return 1;
  return Math.max(0, Math.min(1, free / need));
}

/**
 * Whether the last run lost money and left output unsold. Own-site deliveries
 * count at booked value both ways. Such a plant is not held at a full run to
 * supply its own sister sites; one that sold or delivered everything is.
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
