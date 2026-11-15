import type { LedgerLeg } from "@/lib/ledger/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

/** Each coupon credit witnesses its actual wallet; Treasury stocks are witnessed separately. */
export function couponPayeeCashLegs(
  payments: readonly { account: string; currency: CurrencyCode; amount: number; rate: number }[]
): LedgerLeg[] {
  return payments.flatMap(({ account, currency, amount, rate }) => {
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0)
      throw new Error("Invalid coupon payee cash witness");
    return [
      {
        account,
        amount,
        currencyCode: currency,
        anchorAmount: amount / rate,
        role: "primary" as const,
      },
      {
        account: `mint:sovereign_coupon:${currency}`,
        amount: -amount,
        currencyCode: currency,
        anchorAmount: -amount / rate,
        role: "contra" as const,
      },
    ];
  });
}
