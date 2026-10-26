/**
 * Shadow-ledger witnesses for the economy-only reset.
 *
 * The reset rewrites balances outside a turn, so the next turn's stock check
 * would read every changed account as an uninstrumented write. One witness
 * entry per changed account explains the change: a primary leg on the account
 * and a contra leg on `mint:economy_reset` (balance rose) or
 * `sink:economy_reset` (balance fell). Changes a reseed already witnessed
 * itself, such as corporation starting grants, are subtracted first so nothing
 * is counted twice.
 */
import { accountCurrency, mintSinkAccount } from "@/lib/ledger/accounts";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { LedgerEntryInput } from "@/lib/ledger/types";

const ECONOMY_RESET_LEDGER_REASON = "economy_reset";

/** Smallest anchor change worth a witness; matches the ledger's own epsilon floor. */
const WITNESS_EPSILON_ANCHOR = 0.01;

export interface WitnessDelta {
  account: string;
  currency: string;
  anchor: number;
  native: number;
}

/**
 * Unexplained balance change per account: closing minus opening minus what
 * entries emitted during the reset already explain. Sorted by account.
 */
export function witnessDeltas(input: {
  opening: Record<string, number>;
  closing: Record<string, number>;
  alreadyWitnessed: Record<string, number>;
  anchorRates: Record<string, number>;
  epsilon?: number;
}): WitnessDelta[] {
  const epsilon = input.epsilon ?? WITNESS_EPSILON_ANCHOR;
  const accounts = new Set([...Object.keys(input.opening), ...Object.keys(input.closing)]);
  const out: WitnessDelta[] = [];
  for (const account of [...accounts].sort()) {
    const anchor =
      (input.closing[account] ?? 0) -
      (input.opening[account] ?? 0) -
      (input.alreadyWitnessed[account] ?? 0);
    if (!Number.isFinite(anchor) || Math.abs(anchor) < epsilon) continue;
    const currency = accountCurrency(account);
    const rate = input.anchorRates[currency];
    out.push({
      account,
      currency,
      anchor,
      native: rate !== undefined && rate > 0 ? anchor * rate : anchor,
    });
  }
  return out;
}

/** One balanced witness entry for a delta. */
export function witnessEntry(delta: WitnessDelta, turn: number, createdAt: Date): LedgerEntryInput {
  const currencyCode = delta.currency as CurrencyCode;
  return {
    turn,
    createdAt,
    txType: "economy_reset",
    emitSite: "admin/economyReset",
    legs: [
      {
        account: delta.account,
        amount: delta.native,
        currencyCode,
        anchorAmount: delta.anchor,
        role: "primary",
      },
      {
        account: mintSinkAccount(delta.anchor, ECONOMY_RESET_LEDGER_REASON, currencyCode),
        amount: -delta.native,
        currencyCode,
        anchorAmount: -delta.anchor,
        role: "contra",
      },
    ],
  };
}

/** Sum of primary-leg anchor amounts by account, for entries emitted during the reset. */
export function primaryLegTotals(
  entries: { legs: { account: string; anchorAmount: number; role: string }[] }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of entries)
    for (const leg of entry.legs)
      if (leg.role === "primary" && Number.isFinite(leg.anchorAmount))
        out[leg.account] = (out[leg.account] ?? 0) + leg.anchorAmount;
  return out;
}
