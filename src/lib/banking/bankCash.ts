/**
 * The bank's balance sheet, separate from its holding company's.
 *
 * Two balances instead of one with a rule: the corporation spends
 * `liquidCapital`, the bank spends `bankCharter.cashReserves`. Neither can
 * reach the other except through the two operations below, the only places
 * the boundary is crossed and the only places the rules live.
 *
 * The asymmetry is deliberate. Money goes IN freely (capped only by what the
 * corporation has): a shareholder risking their own money behind depositors
 * needs no permission. Money comes OUT under supervision (capped by
 * {@link upstreamCapacity}): withdrawing reduces the buffer between a bank
 * failure and a depositor haircut, and the recovery waterfall in
 * `insurance.ts` funds payouts from exactly this cash. Upstreaming is limited
 * to genuinely surplus reserves, only from a bank the supervisor calls
 * adequate, never below the reserve requirement.
 */

import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { loadBankingSnapshot } from "@/lib/banking/snapshot";
import { decideBankCommand } from "@/lib/banking/rules/decide";
import type { BankCommand } from "@/lib/banking/rules/boundary";
import { settleTransition } from "@/lib/banking/settlementJournal";
import { emitBankingAuditEvent } from "@/lib/banking/auditEvents";
import type { BankCharter } from "@/lib/db/types/bank";
import {
  bankBalanceSheet,
  getCashReserves as readCashReserves,
  type BalanceSheetCharter,
  type BalanceSheetOptions,
} from "@/lib/banking/balanceSheet";

export type BankCashResult =
  | { ok: true; cashReserves: number; liquidCapital: number; amount: number }
  | { ok: false; error: string };

/**
 * Every balance-sheet line this module used to define now lives in
 * `balanceSheet.ts`, which is the single authority (see the note there). These
 * re-exports keep the existing call sites working while there is exactly one
 * implementation behind them.
 */
export {
  getCashReserves,
  cashBackedDeposits,
  requiredReserves,
  bankEquity,
} from "@/lib/banking/balanceSheet";

/**
 * How much the bank may pay up to its parent right now.
 *
 * Thin wrapper over the `distributable` line of the balance sheet: the lower of
 * surplus reserves and book equity, and zero unless the supervisor calls the
 * bank adequate. Distributing above equity is paying shareholders with
 * depositor money; distributing below the reserve requirement is paying them
 * with the reserves that stand behind a run.
 */
export function upstreamCapacity(
  charter: BalanceSheetCharter & Pick<BankCharter, "capitalStanding" | "totalDeposits">,
  reserveRatio: number,
  options: BalanceSheetOptions = {}
): number {
  return bankBalanceSheet({ charter, reserveRatio, ...options }).distributable;
}

async function readBankCash(
  db: Db,
  corporationId: ObjectId
): Promise<{ cashReserves: number; liquidCapital: number }> {
  const corp = await db
    .collection<Corporation>("corporations")
    .findOne({ _id: corporationId }, { projection: { liquidCapital: 1, bankCharter: 1 } });
  return {
    cashReserves: readCashReserves(corp?.bankCharter),
    liquidCapital: corp?.liquidCapital ?? 0,
  };
}

/**
 * Run one capital command through the boundary and the journal.
 *
 * The rules decide (capability, caps, the distributable line); the journal
 * lands the two legs and the posted-capital memo exactly once; the event is
 * published with the outcome. The shell's only job is to load the snapshot
 * and to report the balances the caller wants to show.
 */
async function runCapitalCommand(
  db: Db,
  corporationId: ObjectId,
  command: BankCommand,
  commandId: string
): Promise<BankCashResult> {
  const loaded = await loadBankingSnapshot(db, corporationId);
  if (!loaded) return { ok: false, error: "This corporation has no active bank charter." };
  const decision = decideBankCommand(loaded.snapshot, command, { commandId });
  if (!decision.allowed) {
    emitBankingAuditEvent(
      {
        kind: "charter.issued",
        command:
          command.type === "inject_capital" ? "bank.capital.inject" : "bank.capital.upstream",
        turn: loaded.snapshot.turn,
        outcome: "rejected",
        reason: decision.message,
        currency: loaded.snapshot.currency,
        bankId: corporationId.toString(),
      },
      db
    );
    return { ok: false, error: decision.message };
  }
  const settled = await settleTransition(db, decision.transition);
  if (settled.status === "rejected" || settled.status === "partial" || settled.error) {
    emitBankingAuditEvent(
      {
        ...decision.transition.event,
        turn: loaded.snapshot.turn,
        outcome: "rejected",
        reason: settled.error ?? "The bank's reserves moved while that was in flight. Try again.",
        currency: loaded.snapshot.currency,
        bankId: corporationId.toString(),
        settlementId: decision.transition.key,
      },
      db
    );
    return { ok: false, error: "The bank's reserves moved while that was in flight. Try again." };
  }
  emitBankingAuditEvent(
    {
      ...decision.transition.event,
      turn: loaded.snapshot.turn,
      outcome: "ok",
      currency: loaded.snapshot.currency,
      bankId: corporationId.toString(),
      settlementId: decision.transition.key,
    },
    db
  );
  const after = await readBankCash(db, corporationId);
  const moved = decision.transition.legs[0]?.amount ?? 0;
  return { ok: true, amount: moved, ...after };
}

/**
 * Corporation -> bank. Capped only by the corporation's own cash.
 *
 * Increments `postedCapital` alongside the cash, because that is what posted
 * capital has always meant: the cumulative shareholder money standing behind
 * the depositors. The cash is the asset; posted capital is the memo of where it
 * came from, and the resolution waterfall reads both.
 */
export async function injectBankCapital(
  db: Db,
  corporationId: ObjectId,
  amount: number,
  commandId: string = new ObjectId().toHexString()
): Promise<BankCashResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be a positive number." };
  }
  return runCapitalCommand(db, corporationId, { type: "inject_capital", amount }, commandId);
}

/**
 * Bank -> corporation. Only surplus reserves, only from an adequate bank.
 *
 * `postedCapital` comes down with the cash but never below zero: a bank that
 * has earned more than its shareholders put in may upstream those earnings
 * without booking negative contributed capital. The reserve floor and the
 * equity ceiling are re-gated inside the journal's guarded debit, so a
 * concurrent turn cannot leave the bank short.
 */
export async function upstreamBankCash(
  db: Db,
  corporationId: ObjectId,
  amount: number,
  _reserveRatio?: number,
  commandId: string = new ObjectId().toHexString()
): Promise<BankCashResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be a positive number." };
  }
  return runCapitalCommand(db, corporationId, { type: "upstream_cash", amount }, commandId);
}
