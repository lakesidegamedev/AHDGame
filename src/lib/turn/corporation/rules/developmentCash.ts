import type { CurrencyCode } from "@/lib/constants/currencies";
import type { LedgerLeg } from "@/lib/ledger/types";

export function developmentCashLegs(
  corporation: string,
  currency: CurrencyCode,
  amount: number,
  rate: number
): LedgerLeg[] {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0)
    throw new Error("Invalid product development cash witness");
  return [
    {
      account: `corporation:${corporation}:${currency}`,
      amount: -amount,
      currencyCode: currency,
      anchorAmount: -amount / rate,
      role: "primary",
    },
    {
      account: `sink:product_development:${currency}`,
      amount,
      currencyCode: currency,
      anchorAmount: amount / rate,
      role: "contra",
    },
  ];
}
