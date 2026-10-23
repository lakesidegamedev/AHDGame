/**
 * Closing the money loop (owner decision 2026-10-18).
 *
 * Under funded demand households spend only cash they receive. Wages are about
 * 38% of value added, so without a return path for profit, company cash piles
 * up and final demand shrinks every turn. AI-run companies are owned by the
 * public: they pay profit beyond what they reinvest into their country's
 * household wallet. State companies remit to their own treasury. Player
 * companies keep their profit; the player decides what to do with it.
 *
 * Pure: plain data in, transfers out. A payout never exceeds the company's
 * cash after settlement, and a loss pays nothing (no clawback).
 */

/** Share of a turn's profit an AI or state company keeps to reinvest. Tunable. */
export const RETAINED_PROFIT_SHARE = 0.4;

export type ProfitOwnerKind = "ai" | "state" | "player";

export interface ProfitDistributionInput {
  accountId: string;
  kind: ProfitOwnerKind;
  /** This turn's settled profit, in the account's anchor units. */
  profit: number;
  /** Cash after settlement, in the same units. */
  cash: number;
  /** Household wallet for AI payouts, treasury for state payouts. */
  recipientAccountId: string | null;
}

export interface ProfitTransfer {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reason: "ai_dividend" | "state_remittance";
}

export function distributeProfits(
  rows: readonly ProfitDistributionInput[],
  retainedShare: number = RETAINED_PROFIT_SHARE
): ProfitTransfer[] {
  if (!Number.isFinite(retainedShare) || retainedShare < 0 || retainedShare > 1)
    throw new Error("Invalid retained profit share");
  const out: ProfitTransfer[] = [];
  const seen = new Set<string>();
  for (const row of [...rows].sort((a, b) => (a.accountId < b.accountId ? -1 : 1))) {
    if (seen.has(row.accountId)) throw new Error("Duplicate profit account");
    seen.add(row.accountId);
    if (row.kind === "player" || !row.recipientAccountId) continue;
    if (row.recipientAccountId === row.accountId) throw new Error("Profit paid to itself");
    if (!Number.isFinite(row.profit) || !Number.isFinite(row.cash)) continue;
    const amount = Math.min(Math.max(0, row.cash), Math.max(0, row.profit) * (1 - retainedShare));
    if (!(amount > 0)) continue;
    out.push({
      fromAccountId: row.accountId,
      toAccountId: row.recipientAccountId,
      amount,
      reason: row.kind === "ai" ? "ai_dividend" : "state_remittance",
    });
  }
  return out;
}
