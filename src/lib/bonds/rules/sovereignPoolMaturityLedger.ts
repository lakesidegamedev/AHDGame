import type { LedgerLeg } from "@/lib/ledger/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

export function sovereignPoolMaturityCashLegs(
  currency: CurrencyCode,
  amount: number,
  rate: number
): LedgerLeg[] {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0)
    throw new Error("Invalid funded pool maturity witness");
  return [
    {
      account: `bond_pool:${currency}:${currency}`,
      amount,
      currencyCode: currency,
      anchorAmount: amount / rate,
      role: "primary",
    },
    {
      account: `mint:bond_settlement:${currency}`,
      amount: -amount,
      currencyCode: currency,
      anchorAmount: -amount / rate,
      role: "contra",
    },
  ];
}
