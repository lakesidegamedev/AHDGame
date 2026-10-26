/**
 * Honest producer-market shadow (funded-market cutover, phase A).
 *
 * The shadow must run on its own money: every turn starts from the cash, stock
 * and prices the previous shadow turn settled, households spend only what they
 * were paid, and each turn proves its books balance. These rules carry that
 * state, close the turn and reconcile it. Nothing here touches live money.
 *
 * Timing (documented so no buyer spends proceeds of its own unsettled orders):
 * - wages are paid inside settlement, before households place orders, and are
 *   spendable the same turn;
 * - AI profit distribution (60% of positive profit, 40% retained) and payments
 *   to operating payees are booked at close and become household cash next turn;
 * - public buyers get this turn's funding at open; unspent funding returns to
 *   the treasury at close (an identified sink, never carried).
 *
 * Pure: plain data in, plain data out.
 */
import { distributeProfits, type ProfitOwnerKind } from "./profitDistributionRules";
import type { MarketAccount } from "./rules";
import type { ProducedStock, PurchasedStock } from "./production";
import type { PriorReceipt } from "./outputResponseRules";
import type { ProducerPayable } from "./payablesRules";

export const SHADOW_STATE_SCHEMA_VERSION = 1;
/** Money-loop residual allowed per cohort, as a share of the activity scale (gate A). */
export const MONEY_LOOP_TOLERANCE = 0.001;

export interface ShadowPlantCarry {
  inputStock: PurchasedStock[];
  outputStock: ProducedStock[];
  receipt: PriorReceipt;
}

export interface ShadowCarryState {
  runId: string;
  worldEpoch: string;
  turn: number;
  predecessorTurn: number | null;
  schemaVersion: number;
  codeSha: string | null;
  /** Closing cash per shadow account, anchor units. */
  accounts: Record<string, number>;
  plants: Record<string, ShadowPlantCarry>;
  /** Unpaid producer bills, settled first next turn. */
  payables: ProducerPayable[];
  /** Reference price per commodity the shadow set for next turn. */
  references: Record<string, number>;
  /** Settled plant value added per country (revenue minus purchases), anchor units per turn. */
  valueAddedByCountry: Record<string, number>;
}

export type ShadowContinuity =
  | { mode: "continue"; runId: string; predecessor: ShadowCarryState }
  | { mode: "new"; runId: string; reason: string };

/**
 * Decide whether this turn continues the previous shadow turn or starts a new,
 * explicitly labelled run. A retry of the same turn reads the same predecessor,
 * so it reproduces the same opening.
 */
export function resolveShadowContinuity(
  predecessor: ShadowCarryState | null,
  input: { worldEpoch: string; turn: number }
): ShadowContinuity {
  const newRun = (reason: string): ShadowContinuity => ({
    mode: "new",
    runId: `${input.worldEpoch}:r${input.turn}`,
    reason,
  });
  if (!predecessor) return newRun("no predecessor");
  if (predecessor.schemaVersion !== SHADOW_STATE_SCHEMA_VERSION)
    return newRun(`schema ${predecessor.schemaVersion} incompatible`);
  if (predecessor.worldEpoch !== input.worldEpoch) return newRun("world changed");
  if (predecessor.turn !== input.turn - 1)
    return newRun(`predecessor turn ${predecessor.turn} is not ${input.turn - 1}`);
  return { mode: "continue", runId: predecessor.runId, predecessor };
}

/**
 * Share of a country's economy the plant economy represents: settled plant
 * value added over GDP, both per turn in anchor units. Public budgets are sized
 * for the whole economy; only this share is spent in the plant market, so the
 * same budget is never funded twice and never inflated.
 */
export function plantEconomyShare(valueAddedPerTurn: number, gdpPerTurn: number): number {
  if (!Number.isFinite(valueAddedPerTurn) || !Number.isFinite(gdpPerTurn) || !(gdpPerTurn > 0))
    return 0;
  return Math.min(1, Math.max(0, valueAddedPerTurn / gdpPerTurn));
}

/** Freight sells anywhere in its own country in the shadow (owner yes, 2026-10-19). */
const COUNTRY_SCOPED_SHADOW_COMMODITIES: ReadonlySet<string> = new Set(["freight"]);

export function shadowBook(book: string, commodity: string, countryId: string): string {
  if (!COUNTRY_SCOPED_SHADOW_COMMODITIES.has(commodity) || !book.startsWith("state:")) return book;
  return `country:${countryId}`;
}

export interface ShadowAccountRole {
  id: string;
  kind: "household" | "public" | "company" | "operatingPayee";
  countryId: string;
}

export interface ShadowCloseInput {
  closingAccounts: readonly MarketAccount[];
  roles: readonly ShadowAccountRole[];
  /** Positive or negative settled profit per company account this turn. */
  profitByCompany: ReadonlyMap<string, number>;
  ownerKindByCompany: ReadonlyMap<string, ProfitOwnerKind>;
  /** Household wallet that receives a company's or payee's payout. */
  householdFor: (accountId: string) => string | null;
}

export interface ShadowCloseResult {
  accounts: Record<string, number>;
  distributed: number;
  operatingSwept: number;
  /** Unspent public funding returned to treasuries (sink). */
  publicReturned: number;
  /** State-company remittances to treasuries (sink). */
  stateRemitted: number;
  transfers: { from: string; to: string; amount: number; reason: string }[];
}

/**
 * Book end-of-turn transfers: AI profit to households, operating payees to the
 * same state's households, unspent public funding back to the treasury.
 * State company remittances leave the plant economy (treasury is outside it).
 */
export function closeShadowTurn(input: ShadowCloseInput): ShadowCloseResult {
  const cash = new Map(input.closingAccounts.map((a) => [a.id, a.cash]));
  const roleById = new Map(input.roles.map((r) => [r.id, r]));
  const transfers: ShadowCloseResult["transfers"] = [];
  const move = (from: string, to: string | null, amount: number, reason: string) => {
    if (!(amount > 0)) return;
    cash.set(from, (cash.get(from) ?? 0) - amount);
    if (to) cash.set(to, (cash.get(to) ?? 0) + amount);
    transfers.push({ from, to: to ?? "treasury", amount, reason });
  };
  const rows = [...input.profitByCompany].flatMap(([accountId, profit]) => {
    const kind = input.ownerKindByCompany.get(accountId);
    if (!kind) return [];
    const recipient = kind === "ai" ? input.householdFor(accountId) : `treasury:${accountId}`;
    return [
      { accountId, kind, profit, cash: cash.get(accountId) ?? 0, recipientAccountId: recipient },
    ];
  });
  let distributed = 0;
  let stateRemitted = 0;
  for (const t of distributeProfits(rows)) {
    if (t.reason === "ai_dividend") {
      move(t.fromAccountId, t.toAccountId, t.amount, t.reason);
      distributed += t.amount;
    } else {
      move(t.fromAccountId, null, t.amount, t.reason);
      stateRemitted += t.amount;
    }
  }
  let operatingSwept = 0;
  let publicReturned = 0;
  for (const [id, amount] of [...cash].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const role = roleById.get(id);
    if (role?.kind === "operatingPayee") {
      const to = input.householdFor(id);
      if (to && to !== id) {
        move(id, to, amount, "operating_income");
        operatingSwept += Math.max(0, amount);
      }
    } else if (role?.kind === "public") {
      move(id, null, amount, "public_return");
      publicReturned += Math.max(0, amount);
    }
  }
  const accounts: Record<string, number> = {};
  for (const [id, amount] of [...cash].sort(([a], [b]) => (a < b ? -1 : 1)))
    if (roleById.get(id)?.kind !== "public" && roleById.get(id)?.kind !== "operatingPayee")
      accounts[id] = amount;
  return { accounts, distributed, operatingSwept, publicReturned, stateRemitted, transfers };
}

export interface CohortFlows {
  opening: number;
  wagesPaid: number;
  distributionsPaid: number;
  operatingIncome: number;
  settledSpend: number;
  closing: number;
}

export interface CohortCheck extends CohortFlows {
  cohort: string;
  /** Opening minus closing: positive means savings drawn down. */
  savingsDrawdown: number;
  residual: number;
  residualShare: number;
  zeroActivity: boolean;
  pass: boolean;
}

/**
 * closing = opening + wages + distributions + operating income - settled spend.
 * The residual share is against max(|opening| + inflows + outflows, 1).
 */
export function checkCohort(cohort: string, f: CohortFlows): CohortCheck {
  const expected =
    f.opening + f.wagesPaid + f.distributionsPaid + f.operatingIncome - f.settledSpend;
  const residual = f.closing - expected;
  const scale = Math.max(
    Math.abs(f.opening) + f.wagesPaid + f.distributionsPaid + f.operatingIncome + f.settledSpend,
    1
  );
  const residualShare = Math.abs(residual) / scale;
  return {
    cohort,
    ...f,
    savingsDrawdown: f.opening - f.closing,
    residual,
    residualShare,
    zeroActivity:
      f.wagesPaid === 0 &&
      f.distributionsPaid === 0 &&
      f.operatingIncome === 0 &&
      f.settledSpend === 0,
    pass: Number.isFinite(residualShare) && residualShare <= MONEY_LOOP_TOLERANCE,
  };
}

/**
 * Whole-shadow conservation: every account's closing cash equals opening cash
 * plus identified external sources minus identified sinks. Internal transfers
 * (trades, wages, dividends, sweeps) must net to zero.
 */
export function checkConservation(f: {
  openingTotal: number;
  closingTotal: number;
  sources: Readonly<Record<string, number>>;
  sinks: Readonly<Record<string, number>>;
}): { residual: number; residualShare: number; pass: boolean } {
  const inflow = Object.values(f.sources).reduce((s, v) => s + v, 0);
  const outflow = Object.values(f.sinks).reduce((s, v) => s + v, 0);
  const residual = f.closingTotal - (f.openingTotal + inflow - outflow);
  const residualShare =
    Math.abs(residual) / Math.max(Math.abs(f.openingTotal) + inflow + outflow, 1);
  return { residual, residualShare, pass: residualShare <= MONEY_LOOP_TOLERANCE };
}
