import type { LedgerLeg } from "@/lib/ledger/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

export function foundingCreditCashLegs(
  corporation: string,
  currency: CurrencyCode,
  amount: number,
  rate: number
): LedgerLeg[] {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0)
    throw new Error("Invalid founding credit cash witness");
  if (amount === 0) return [];
  return [
    {
      account: `corporation:${corporation}:${currency}`,
      amount,
      currencyCode: currency,
      anchorAmount: amount / rate,
      role: "primary",
    },
    {
      account: `mint:corporate_bond_issuance:${currency}`,
      amount: -amount,
      currencyCode: currency,
      anchorAmount: -amount / rate,
      role: "contra",
    },
  ];
}
