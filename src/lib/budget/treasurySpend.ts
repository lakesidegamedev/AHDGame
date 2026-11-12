import type { Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import { computeFiscalImpact } from "@/lib/budget/fiscalImpact";
import type { CountryId } from "@/lib/constants/countries";
import {
  resolveTreasuryCashOptions,
  witnessTreasuryCash,
  type TreasuryCashFlow,
  type TreasuryCashOptions,
} from "@/lib/nationalization/treasuryLedger";
import { settleTransition } from "@/lib/banking/settlementJournal";
import { snapshotTreasuryCurrency } from "@/lib/ledger/balanceSnapshot";
import type { BankingTransition } from "@/lib/banking/rules/boundary";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

export interface FiscalImpact {
  fromSurplus: number;
  addedToDebt: number;
  newTreasuryBalance: number;
  newDebtPrincipal: number;
}

/**
 * Canonical treasury mover. `delta` is signed (negative = spend, positive =
 * credit). Moves the SSOT `treasuryBalance` only: `debt.principal` belongs to
 * the bond ledger (see bonds/sovereignPrincipal.ts) and is never re-derived
 * from the balance. Returns the surplus/debt split of a SPEND (zero split for
 * a credit) plus the post-move balance and the untouched bond-owned principal.
 * The treasury is allowed to go negative.
 */
/**
 * Opt-in ledger witness for a caller whose own rows do not already evidence the
 * treasury. It books exactly the movement that landed.
 */
export interface TreasurySpendWitness {
  flow: TreasuryCashFlow;
  /** Stable caller-owned identity for funded, exactly-once cash movement. */
  key?: string;
  /** The caller's module path, recorded as the entry's emit site. */
  site: string;
  ledger?: TreasuryCashOptions;
  treasuryCashLedgerEnabled?: boolean;
}

export class InsufficientFundedTreasuryCash extends Error {
  constructor(countryId: string, amount: number) {
    super(`Funded Treasury cash cannot cover ${amount} for ${countryId}`);
    this.name = "InsufficientFundedTreasuryCash";
  }
}

export class UnpairedFundedTreasuryCredit extends Error {
  constructor(countryId: string, amount: number) {
    super(`Funded Treasury credit of ${amount} for ${countryId} has no paired source`);
    this.name = "UnpairedFundedTreasuryCredit";
  }
}

async function moveTreasury(
  db: Db,
  countryId: string,
  delta: number,
  _resyncDerived: boolean,
  witness?: TreasurySpendWitness
): Promise<FiscalImpact> {
  const budget = await federalBudgetCollection(db).findOne({
    countryId: countryId as FederalBudget["countryId"],
  });
  const before = budget?.treasuryBalance ?? 0;
  const after = Math.round(before + delta);

  const split =
    delta < 0 ? computeFiscalImpact(before, -delta) : { fromSurplus: 0, addedToDebt: 0 };

  const now = new Date();
  const newDebtPrincipal = Math.max(0, budget?.debt?.principal ?? 0);

  const ledger = witness ? await resolveTreasuryCashOptions(db, witness.ledger) : undefined;
  const fundedCashEnabled =
    witness?.treasuryCashLedgerEnabled === true ||
    ledger?.context?.treasuryCashLedgerEnabled === true;
  if (fundedCashEnabled) {
    if (delta > 0) throw new UnpairedFundedTreasuryCredit(countryId, delta);
    if (!witness?.key) throw new Error("Funded Treasury spending requires a stable receipt key");
    const context = ledger?.context;
    if (!context) throw new Error("Funded Treasury spending requires its frozen cash context");
    const amount = Math.abs(delta);
    const currency =
      context.treasuryCurrencies.get(countryId) ?? snapshotTreasuryCurrency({ countryId });
    const transition: BankingTransition = {
      key: `treasury-spend:${witness.key}`,
      kind: "treasury_funded_expense",
      turn: context.turn,
      currency,
      legs: [
        {
          kind: "debit",
          amount,
          collection: "federalBudget",
          filter: {
            countryId: countryId as FederalBudget["countryId"],
            treasuryCashLocal: { $gte: amount },
          },
          path: "treasuryCashLocal",
          note: "Fund the Treasury expense from spendable cash",
        },
        { kind: "burn", amount, note: "Settle the Treasury expense outside government cash" },
      ],
      projections: [
        {
          collection: "federalBudget",
          filter: { countryId: countryId as FederalBudget["countryId"] },
          update: { $inc: { treasuryBalance: -amount }, $set: { updatedAt: now } },
          note: "Update the signed fiscal position after the funded expense",
        },
      ],
      event: {
        kind: "monetary.executed",
        command: witness.site,
        subjectType: "government",
        subjectId: countryId,
        amount,
        meta: { flow: witness.flow },
      },
    };
    const settled = await settleTransition(db, transition);
    if (settled.status === "rejected") {
      if (settled.error?.includes("guard") || settled.error?.includes("no matching")) {
        throw new InsufficientFundedTreasuryCash(countryId, amount);
      }
      throw new Error(settled.error ?? "Funded Treasury expense was rejected");
    }
    if (settled.status !== "applied" && settled.status !== "replayed") {
      throw new Error(settled.error ?? "Funded Treasury expense is incomplete");
    }
    const currentBudget = await federalBudgetCollection(db).findOne(
      { countryId: countryId as FederalBudget["countryId"] },
      { projection: { treasuryBalance: 1 } }
    );
    return {
      ...split,
      newTreasuryBalance: currentBudget?.treasuryBalance ?? before + delta,
      newDebtPrincipal,
    };
  }

  // $inc, not $set of a value computed from the read above: two concurrent
  // spends on one country would otherwise overwrite each other.
  const result = await federalBudgetCollection(db).updateOne(
    { countryId: countryId as FederalBudget["countryId"] },
    { $inc: { treasuryBalance: after - before }, $set: { updatedAt: now } }
  );
  if (witness && (result?.matchedCount ?? 0) > 0) {
    await witnessTreasuryCash(db, ledger, {
      flow: witness.flow,
      account: { kind: "government", countryId: countryId as CountryId },
      amount: after - before,
      now,
      site: witness.site,
    });
  }

  return { ...split, newTreasuryBalance: after, newDebtPrincipal };
}

/** Spend `amountLocal` (≥0) from the treasury: surplus first, remainder = new debt. */
export function spendFromTreasury(
  db: Db,
  countryId: string,
  amountLocal: number,
  opts: { resyncDerived?: boolean; witness?: TreasurySpendWitness } = {}
): Promise<FiscalImpact> {
  return moveTreasury(
    db,
    countryId,
    -Math.max(0, amountLocal),
    opts.resyncDerived ?? true,
    opts.witness
  );
}

/** Credit `amountLocal` (≥0) back to the treasury (inverse of spendFromTreasury). */
export function creditTreasury(
  db: Db,
  countryId: string,
  amountLocal: number,
  opts: { resyncDerived?: boolean; witness?: TreasurySpendWitness } = {}
): Promise<FiscalImpact> {
  return moveTreasury(
    db,
    countryId,
    Math.max(0, amountLocal),
    opts.resyncDerived ?? true,
    opts.witness
  );
}

/**
 * Give back a keyed treasury spend whose follow-up failed. With the funded cash
 * ledger on, the spend burned its cash under `treasury-spend:<key>`, so the refund
 * mints the same amount back under its own key, and only when that spend landed:
 * net money is unchanged and a repeated refund replays instead of paying twice.
 * With the ledger off this is a plain credit.
 */
export async function refundTreasurySpend(
  db: Db,
  countryId: string,
  amountLocal: number,
  witness: TreasurySpendWitness & { key: string }
): Promise<void> {
  const amount = Math.max(0, amountLocal);
  if (!(amount > 0)) return;
  const ledger = await resolveTreasuryCashOptions(db, witness.ledger);
  const context = ledger.context;
  const funded =
    witness.treasuryCashLedgerEnabled === true || context?.treasuryCashLedgerEnabled === true;
  if (!funded) {
    await moveTreasury(db, countryId, amount, true, {
      flow: witness.flow,
      site: witness.site,
      ledger,
    });
    return;
  }
  if (!context) throw new Error("Funded Treasury refund requires its frozen cash context");
  const spend = await bankMoneyMovesCollection<{
    _id: string;
    status?: string;
    legs?: { applied?: boolean }[];
  }>(db).findOne(
    { _id: `treasury-spend:${witness.key}` },
    { projection: { status: 1, "legs.applied": 1 } }
  );
  const landed =
    !!spend && spend.status !== "rejected" && (spend.legs ?? []).every((leg) => leg.applied);
  if (!landed) return;
  const currency =
    context.treasuryCurrencies.get(countryId) ?? snapshotTreasuryCurrency({ countryId });
  const settled = await settleTransition(db, {
    key: `treasury-spend-refund:${witness.key}`,
    kind: "treasury_funded_expense_refund",
    turn: context.turn,
    currency,
    legs: [
      {
        kind: "credit",
        amount,
        collection: "federalBudget",
        filter: { countryId: countryId as FederalBudget["countryId"] },
        path: "treasuryCashLocal",
        note: "Return the refunded expense to spendable Treasury cash",
      },
      { kind: "mint", amount, note: "Reverse the settled expense burn" },
    ],
    projections: [
      {
        collection: "federalBudget",
        filter: { countryId: countryId as FederalBudget["countryId"] },
        update: { $inc: { treasuryBalance: amount }, $set: { updatedAt: new Date() } },
        note: "Update the signed fiscal position after the refund",
      },
    ],
    event: {
      kind: "monetary.executed",
      command: witness.site,
      subjectType: "government",
      subjectId: countryId,
      amount,
      meta: { flow: witness.flow },
    },
  });
  if (settled.status !== "applied" && settled.status !== "replayed")
    throw new Error(settled.error ?? "Funded Treasury refund is incomplete");
}
