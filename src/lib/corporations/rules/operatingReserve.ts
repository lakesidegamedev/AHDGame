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
 * Next turn's run after a build, by the same rule the producer run uses: the
 * cash left funds the run, and a run whose expected sales (less the margin the
 * sales advance holds back) cover its bills is funded in full.
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
}): string {
  const sym = (input.currencyCode && CURRENCY_SYMBOLS[input.currencyCode as CurrencyCode]) || "$";
  const money = (x: number) => `${sym}${Math.round(Math.max(0, x)).toLocaleString("en-US")}`;
  return fill(OPERATING_RESERVE_COPY.refused, {
    cashAfter: money(input.cashLocal - input.costLocal),
    reserve: money(input.reserveLocal),
    turns: String(input.turns),
    maxAffordable: money(input.maxAffordableLocal),
  });
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
