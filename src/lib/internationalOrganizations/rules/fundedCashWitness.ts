import type { CurrencyCode } from "@/lib/constants/currencies";
import type { LedgerLeg } from "@/lib/ledger/types";

export function organizationFundCashLegs(
  organization: string,
  currency: CurrencyCode,
  amount: number,
  rate: number
): LedgerLeg[] {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0)
    throw new Error("Invalid funded organization cash witness");
  return [
    {
      account: `org:${organization}:${currency}`,
      amount,
      currencyCode: currency,
      anchorAmount: amount / rate,
      role: "primary",
    },
    {
      account: `${amount > 0 ? "mint" : "sink"}:organization_fund_cash:${currency}`,
      amount: -amount,
      currencyCode: currency,
      anchorAmount: -amount / rate,
      role: "contra",
    },
  ];
}
