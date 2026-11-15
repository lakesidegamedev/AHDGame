/** Read funded bank principal from immutable settlement plans, not debt face. */
export interface BankMaturityReceipt {
  projections?: readonly {
    applied?: boolean;
    projection?: {
      collection?: string;
      insert?: {
        txType?: string;
        emitSite?: string;
        legs?: readonly { account: string; amount: number; role?: string }[];
      };
    };
  }[];
}

export function fundedBankMaturityCashByCountry(
  receipts: readonly BankMaturityReceipt[]
): Record<string, number> {
  const paid: Record<string, number> = {};
  for (const receipt of receipts) {
    for (const item of receipt.projections ?? []) {
      const entry = item.projection?.insert;
      if (
        item.applied !== true ||
        item.projection?.collection !== "ledgerEntries" ||
        entry?.txType !== "gov_bond_maturity_payment" ||
        entry.emitSite !== "banking/bankSovereignClaims:funding"
      )
        continue;
      for (const leg of entry.legs ?? []) {
        if (leg.role !== "primary" || !leg.account.startsWith("government_cash:")) continue;
        const match = /^government_cash:([A-Z]{2,3}):[A-Z]{3}$/.exec(leg.account);
        if (!match || !Number.isFinite(leg.amount) || leg.amount > 0)
          throw new Error("Invalid funded bank maturity cash receipt");
        const country = match[1];
        const total = (paid[country] ?? 0) - leg.amount;
        if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER)
          throw new Error("Unsafe funded bank maturity cash total");
        paid[country] = total;
      }
    }
  }
  return paid;
}
