import type { CurrencyCode } from "@/lib/constants/currencies";
import type { LedgerLeg } from "@/lib/ledger/types";

export function nppShareCashLegs(
  npp: string,
  currency: CurrencyCode,
  amountAnchor: number,
  reason: "equity_transfer" | "corporation_founding_fee" = "equity_transfer"
): LedgerLeg[] {
  if (!Number.isFinite(amountAnchor)) throw new Error("Invalid NPP share cash witness");
  return [
    {
      account: `npp:${npp}:${currency}`,
      amount: amountAnchor,
      currencyCode: currency,
      anchorAmount: amountAnchor,
      role: "primary",
    },
    {
      account: `${amountAnchor > 0 ? "mint" : "sink"}:${reason}:${currency}`,
      amount: -amountAnchor,
      currencyCode: currency,
      anchorAmount: -amountAnchor,
      role: "contra",
    },
  ];
}
