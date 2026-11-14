import type { CurrencyCode } from "@/lib/constants/currencies";
import type { LedgerLeg } from "@/lib/ledger/types";

export function constructionContributionCashLegs(
  borrower: string,
  currency: CurrencyCode,
  amount: number,
  rate: number
): LedgerLeg[] {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0)
    throw new Error("Invalid construction contribution witness");
  return [
    {
      account: `corporation:${borrower}:${currency}`,
      amount: -amount,
      currencyCode: currency,
      anchorAmount: -amount / rate,
      role: "primary",
    },
    {
      account: `sink:construction_contribution:${currency}`,
      amount,
      currencyCode: currency,
      anchorAmount: amount / rate,
      role: "contra",
    },
  ];
}
