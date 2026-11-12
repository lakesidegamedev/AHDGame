/**
 * Soft-budget operating advance for state companies on a funded producer turn.
 *
 * A funded plant runs only what its cash can staff and supply, but a state
 * company remits profit to the treasury and holds almost no cash, so it would
 * plan nothing. The legacy path ran these on a soft budget (treasury covered
 * the loss). Funded equivalent: before planning, the owning treasury advances
 * exactly the gap between the company's cash and its full run (old bills, fixed
 * bills, wages, inputs at the bid ceiling). At close the company returns any
 * unspent advance, so the treasury carries only the actual run cost.
 *
 * Pure: plain data in, plain data out. Anchor units throughout.
 */
import { producerRunBudget, type ProductionPlan } from "./production";
import type { ProducerPayable } from "./payablesRules";

export interface StateRunAdvance {
  accountId: string;
  /** Anchor advanced so the company's cash covers its whole run. */
  amount: number;
}

/**
 * Advance each state company needs so its cash covers old bills plus its full
 * run. Companies not in `stateAccountIds`, or already holding enough, get none.
 */
export function stateRunAdvances(input: {
  plans: readonly ProductionPlan[];
  payables: readonly ProducerPayable[];
  /** Opening cash per company, anchor. */
  cashByAccount: ReadonlyMap<string, number>;
  stateAccountIds: ReadonlySet<string>;
}): StateRunAdvance[] {
  const plans = input.plans.filter((p) => input.stateAccountIds.has(p.accountId));
  if (plans.length === 0) return [];
  const { fixedBills, variableNeed } = producerRunBudget(plans);
  // Cash goes to old bills before this turn's run (see reserveUnpaidCash), so
  // the run is only funded once they are covered too.
  const owed = new Map<string, number>();
  for (const claim of input.payables)
    if (input.stateAccountIds.has(claim.debtorAccountId) && claim.amount > 0)
      owed.set(claim.debtorAccountId, (owed.get(claim.debtorAccountId) ?? 0) + claim.amount);
  const out: StateRunAdvance[] = [];
  for (const accountId of [...new Set(plans.map((p) => p.accountId))].sort()) {
    const need =
      (owed.get(accountId) ?? 0) +
      (fixedBills.get(accountId) ?? 0) +
      (variableNeed.get(accountId) ?? 0);
    const cash = Math.max(0, input.cashByAccount.get(accountId) ?? 0);
    const amount = need - cash;
    if (Number.isFinite(amount) && amount > 0) out.push({ accountId, amount });
  }
  return out;
}

/**
 * What a state company returns at close: the advance, capped at the cash it
 * holds. Anything above the advance is its own trading surplus, which the
 * existing remittance handles; a shortfall is the operating loss the treasury
 * absorbs, exactly as the loss backing does.
 */
export function stateRunAdvanceReturn(advance: number, closingCash: number): number {
  if (!(advance > 0) || !(closingCash > 0)) return 0;
  return Math.min(advance, closingCash);
}
