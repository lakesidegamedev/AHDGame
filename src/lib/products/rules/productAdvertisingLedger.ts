import type { LedgerLeg } from "@/lib/ledger/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

/** Clearing cash is held separately from the corporate cash stocks in the shadow ledger. */
export function productAdvertisingCashLegs(
  payments: readonly {
    corporation: string;
    currency: CurrencyCode;
    amount: number;
    rate: number;
  }[]
): LedgerLeg[] {
  return payments.flatMap(({ corporation, currency, amount, rate }) => {
    if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0)
      throw new Error("Invalid product advertising cash witness");
    return [
      {
        account: `corporation:${corporation}:${currency}`,
        amount,
        currencyCode: currency,
        anchorAmount: amount / rate,
        role: "primary" as const,
      },
      {
        account: `${amount < 0 ? "sink" : "mint"}:product_advertising_clearing:${currency}`,
        amount: -amount,
        currencyCode: currency,
        anchorAmount: -amount / rate,
        role: "contra" as const,
      },
    ];
  });
}
