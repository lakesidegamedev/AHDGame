/**
 * Operating reserve on capacity builds. A build paid from
 * cash may not leave the company with less than a few turns of the bills its
 * plants run on: wages, site bills and inputs, read from each plant's last
 * settled receipt. Spending the running cash on construction cuts every plant
 * to the share the leftover cash can fund, and a cut run earns too little to
 * rebuild the cash. The CEO may still confirm the build past the reserve.
 *
 * Pure: plain data in, plain data out. Amounts are in whatever unit the caller
 * passes (anchor in the build command); the message takes local amounts.
 */
import { CURRENCY_SYMBOLS, type CurrencyCode } from "@/lib/constants/currencies";
import { salesFundedRunShare } from "@/lib/market/producerMarket/salesAdvanceRules";

/** Turns of running bills a cash build must leave behind. */
export const OPERATING_RESERVE_TURNS = 3;

/** A receipt older than this many turns no longer says what the plants run on. */
export const OPERATING_RESERVE_RECEIPT_MAX_AGE = 3;

/** Most a cash-cut run is scaled up to read its planned run's bills. */
const MAX_RUN_SCALE = 20;

/** The parts of a plant's settled receipt the reserve reads. */
export interface ReserveReceipt {
  turn: number;
  labourPaid?: number;
  labourArrears?: number;
  otherOperatingPaid?: number;
  otherOperatingArrears?: number;
  purchases?: number;
  /** Sales of the run, and what its own sites paid each other for deliveries. */
  revenue?: number;
  internalSupplyIncome?: number;
  activeUnits?: number;
  producedUnits?: number;
  plannedRunShare?: number;
  runCutBy?: readonly string[];
}

const amount = (x: number | undefined) =>
  typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;

/**
 * Running bills of one turn across a company's plants: wages, site bills and
 * inputs bought, paid or owed. A plant its cash cut short is read at the run
 * it planned, since that is the run the cash has to fund once it recovers.
 * Receipts older than `maxAge` turns before `turn` are left out.
 */
export function runningBillsPerTurn(
  receipts: readonly ReserveReceipt[],
  turn: number,
  maxAge: number = OPERATING_RESERVE_RECEIPT_MAX_AGE
): number {
  return runningFlowsPerTurn(receipts, turn, maxAge).bills;
}

/**
 * Running bills and expected sales of one turn across a company's plants, both
 * read from the last settled receipts at the run the plants planned. Sales
 * count what own sites paid each other for deliveries as well as market sales,
 * since the bills count the inputs those deliveries supplied.
 */
export function runningFlowsPerTurn(
  receipts: readonly ReserveReceipt[],
  turn: number,
  maxAge: number = OPERATING_RESERVE_RECEIPT_MAX_AGE
): { bills: number; revenue: number } {
  let bills = 0;
  let revenue = 0;
  for (const r of receipts) {
    if (!Number.isFinite(r.turn) || turn - r.turn > maxAge) continue;
    const plantBills =
      amount(r.labourPaid) +
      amount(r.labourArrears) +
      amount(r.otherOperatingPaid) +
      amount(r.otherOperatingArrears) +
      amount(r.purchases);
    let scale = 1;
    const planned = amount(r.activeUnits) * Math.min(1, amount(r.plannedRunShare));
    const produced = amount(r.producedUnits);
    if (r.runCutBy?.includes("cash") && produced > 0 && planned > produced)
      scale = Math.min(MAX_RUN_SCALE, planned / produced);
    bills += plantBills * scale;
    revenue += (amount(r.revenue) + amount(r.internalSupplyIncome)) * scale;
  }
  return {
    bills: Number.isFinite(bills) ? bills : 0,
    revenue: Number.isFinite(revenue) ? revenue : 0,
  };
}

/** What next turn's run looks like once a build has taken its cash. */
export interface RunAfterBuild {
  /** Cash left after the build (never below 0). */
  cashAfter: number;
  /** Share of the plants' planned run the cash and the run's own sales can fund, 0 to 1. */
  runShare: number;
  /** Whole percent of the run that would be cut, 0 when none. */
  cutPercent: number;
}

/**
 * Next turn's run after a build, by the same rule the producer run uses: a run
 * whose expected sales cover its bills is funded in full however little cash
 * the build leaves, and one that does not runs the share the cash left covers.
 */
export function runAfterBuild(input: {
  cash: number;
  cost: number;
  billsPerTurn: number;
  revenuePerTurn: number;
}): RunAfterBuild {
  const cashAfter = Math.max(
    0,
    (Number.isFinite(input.cash) ? input.cash : 0) - amount(input.cost)
  );
  const need = amount(input.billsPerTurn);
  if (need <= 0) return { cashAfter, runShare: 1, cutPercent: 0 };
  const cashOnly = Math.min(1, cashAfter / need);
  const runShare = Math.max(
    cashOnly,
    salesFundedRunShare({ free: cashAfter, need, expectedRevenue: amount(input.revenuePerTurn) })
  );
  const cutPercent = Math.min(100, Math.max(0, Math.round((1 - runShare) * 100)));
  return { cashAfter, runShare, cutPercent };
}

export interface OperatingReserveCheck {
  /** True when the build leaves at least the reserve, or there is no reserve to keep. */
  ok: boolean;
  /** Cash the company must keep: `turns` turns of running bills. */
  reserve: number;
  /** Largest build that keeps the reserve; 0 when cash is already below it. */
  maxAffordable: number;
}

/** Whether a build costing `cost` from `cash` keeps `turns` turns of `billsPerTurn`. */
export function operatingReserveCheck(input: {
  cash: number;
  cost: number;
  billsPerTurn: number;
  turns?: number;
}): OperatingReserveCheck {
  const turns = input.turns ?? OPERATING_RESERVE_TURNS;
  const reserve = turns > 0 ? amount(input.billsPerTurn) * turns : 0;
  const cash = Number.isFinite(input.cash) ? input.cash : 0;
  const maxAffordable = Math.max(0, cash - reserve);
  return { ok: reserve <= 0 || amount(input.cost) <= maxAffordable, reserve, maxAffordable };
}

/** Player-facing copy for the reserve refusal and the bulk skip reason. */
export const OPERATING_RESERVE_COPY = {
  refused:
    "This build would leave {cashAfter} in cash, less than the {reserve} your plants need to run for {turns} turns (wages, site bills and inputs from last turn). The most you can build and keep that reserve is {maxAffordable}. Confirm the override to build anyway.",
  bulkSkipped: "Would leave less than {turns} turns of running costs in cash",
  purchaseRefused:
    "This purchase would leave {cashAfter} in cash, less than the {reserve} your plants need to run for {turns} turns (wages, site bills and inputs from last turn). The most you can spend and keep that reserve is {maxAffordable}. Confirm the override to buy anyway.",
  purchaseOverCash:
    "This purchase costs {cost}, more than the {cash} the company has. A company cannot spend into debt on the share market.",
  restingTrimmed:
    "Released {released} of escrow so the company keeps {turns} turns of running costs in cash",
} as const;

/** Fill a copy template's {placeholders}. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/** The refusal message, every amount already in the corporation's local currency. */
export function operatingReserveMessage(input: {
  costLocal: number;
  cashLocal: number;
  reserveLocal: number;
  maxAffordableLocal: number;
  turns: number;
  currencyCode: CurrencyCode | string | null | undefined;
  /** What the cash is for; a build unless told otherwise. */
  spend?: "build" | "purchase";
}): string {
  const money = moneyFormatter(input.currencyCode);
  const template =
    input.spend === "purchase"
      ? OPERATING_RESERVE_COPY.purchaseRefused
      : OPERATING_RESERVE_COPY.refused;
  return fill(template, {
    cashAfter: money(input.cashLocal - input.costLocal),
    reserve: money(input.reserveLocal),
    turns: String(input.turns),
    maxAffordable: money(input.maxAffordableLocal),
  });
}

function moneyFormatter(currencyCode: CurrencyCode | string | null | undefined) {
  const sym = (currencyCode && CURRENCY_SYMBOLS[currencyCode as CurrencyCode]) || "$";
  return (x: number) => `${sym}${Math.round(Math.max(0, x)).toLocaleString("en-US")}`;
}

/** The hard refusal when a purchase costs more than the company's cash. */
export function purchaseOverCashMessage(input: {
  costLocal: number;
  cashLocal: number;
  currencyCode: CurrencyCode | string | null | undefined;
}): string {
  const money = moneyFormatter(input.currencyCode);
  return fill(OPERATING_RESERVE_COPY.purchaseOverCash, {
    cost: money(input.costLocal),
    cash: money(input.cashLocal),
  });
}

/** Why a resting buy order gave back escrow at turn time. */
export function restingOrderTrimReason(input: {
  releasedLocal: number;
  turns: number;
  currencyCode: CurrencyCode | string | null | undefined;
}): string {
  return fill(OPERATING_RESERVE_COPY.restingTrimmed, {
    released: moneyFormatter(input.currencyCode)(input.releasedLocal),
    turns: String(input.turns),
  });
}

/** Outcome of checking one corporate share-market purchase against its cash. */
export type PurchaseReserveVerdict =
  { kind: "ok" } | { kind: "over_cash" } | { kind: "below_reserve"; check: OperatingReserveCheck };

/**
 * A corporate purchase on the share market. Spending more than the cash on
 * hand is always refused. Spending into the operating reserve is refused
 * unless the CEO confirmed it. All amounts in one unit.
 */
export function purchaseReserveVerdict(input: {
  cash: number;
  cost: number;
  billsPerTurn: number;
  turns: number;
  confirmed: boolean;
}): PurchaseReserveVerdict {
  const cash = Number.isFinite(input.cash) ? input.cash : 0;
  const cost = amount(input.cost);
  if (cost > cash + 1e-6) return { kind: "over_cash" };
  const check = operatingReserveCheck({
    cash,
    cost,
    billsPerTurn: input.billsPerTurn,
    turns: input.turns,
  });
  if (check.ok || input.confirmed) return { kind: "ok" };
  return { kind: "below_reserve", check };
}

/** One resting corporate buy order the turn may trim, newest first. */
export interface TrimmableBuyOrder {
  id: string;
  sharesRemaining: number;
  /** Escrow held for the unfilled shares, in the buyer's cash unit. */
  escrowInBuyerUnits: number;
}

/**
 * Escrow to give back from a company's resting buy orders so its cash is
 * restored to the operating reserve before they fill. Orders are trimmed in
 * the order given (callers pass newest first) by whole shares; an order that
 * would keep no shares is released in full. Returns only orders that change.
 */
export function restingOrderReserveTrim(input: {
  cash: number;
  reserve: number;
  orders: readonly TrimmableBuyOrder[];
}): Array<{ id: string; sharesReleased: number; releasedInBuyerUnits: number }> {
  const cash = Number.isFinite(input.cash) ? input.cash : 0;
  let shortfall = amount(input.reserve) - cash;
  const out: Array<{ id: string; sharesReleased: number; releasedInBuyerUnits: number }> = [];
  for (const o of input.orders) {
    if (!(shortfall > 1e-6)) break;
    const shares = Math.floor(amount(o.sharesRemaining));
    const escrow = amount(o.escrowInBuyerUnits);
    if (shares <= 0 || escrow <= 0) continue;
    const perShare = escrow / shares;
    const sharesReleased = Math.min(shares, Math.ceil(shortfall / perShare - 1e-9));
    const releasedInBuyerUnits = sharesReleased === shares ? escrow : sharesReleased * perShare;
    out.push({ id: o.id, sharesReleased, releasedInBuyerUnits });
    shortfall -= releasedInBuyerUnits;
  }
  return out;
}

/** The bulk skip reason. */
export function operatingReserveSkipReason(turns: number): string {
  return fill(OPERATING_RESERVE_COPY.bulkSkipped, { turns: String(turns) });
}

/** The build warning, shown before the confirm button. `cashAfterText` is already formatted. */
export function runAfterBuildMessage(input: {
  cashAfterText: string;
  cutPercent: number;
  belowReserve: boolean;
}): string {
  if (input.cutPercent > 0)
    return `After this build your cash is ${input.cashAfterText}; next turn's run would be cut about ${input.cutPercent}%.`;
  if (input.belowReserve)
    return `After this build your cash is ${input.cashAfterText}, below your running reserve. Your plants' sales still cover next turn's run, so it would not be cut.`;
  return `After this build your cash is ${input.cashAfterText}; next turn's run would be kept.`;
}

/** Error code the API returns when a company spend would break the operating reserve. */
export const OPERATING_RESERVE_REFUSAL_CODE = "OPERATING_RESERVE_SHORT";

/** True when an API error body is the operating-reserve refusal the CEO may confirm past. */
export function isOperatingReserveRefusal(body: unknown): boolean {
  return (
    !!body &&
    typeof body === "object" &&
    (body as { code?: unknown }).code === OPERATING_RESERVE_REFUSAL_CODE
  );
}
