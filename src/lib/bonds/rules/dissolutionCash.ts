import type { CurrencyCode } from "@/lib/constants/currencies";
import type { LedgerLeg } from "@/lib/ledger/types";
import { oid, type TransitionLeg } from "@/lib/banking/rules/boundary";

export function dissolutionCashPlan(input: {
  corporation: string;
  currency: CurrencyCode;
  rate: number;
  liquidCapital: number;
  pendingOperatingCash: number;
  assetLiquidationCredit: number;
}): { legs: TransitionLeg[]; ledgerLegs: LedgerLeg[] } {
  const {
    corporation,
    currency,
    rate,
    liquidCapital,
    pendingOperatingCash,
    assetLiquidationCredit,
  } = input;
  if (
    ![liquidCapital, pendingOperatingCash, assetLiquidationCredit, rate].every(Number.isFinite) ||
    rate <= 0 ||
    assetLiquidationCredit < 0
  )
    throw new Error("Invalid dissolution cash quote");
  const legs: TransitionLeg[] = [];
  for (const [path, balance] of [
    ["liquidCapital", liquidCapital],
    ["pendingOperatingCash", pendingOperatingCash],
  ] as const) {
    if (balance === 0) continue;
    legs.push({
      kind: balance > 0 ? "debit" : "credit",
      collection: "corporations",
      filter: { _id: oid(corporation), [path]: balance },
      path,
      amount: Math.abs(balance),
      valuation: { currencyCode: currency, localPerAnchor: rate },
      note: "Retire the departing corporation cash balance",
    });
    legs.push({
      kind: balance > 0 ? "burn" : "mint",
      amount: Math.abs(balance) / rate,
      valuation: { currencyCode: "ANCHOR", localPerAnchor: 1 },
      note: "Close the departing cash account",
    });
  }
  const ledgerLegs: LedgerLeg[] = [];
  for (const [amount, reason] of [
    [assetLiquidationCredit, "bond_settlement"],
    [-(liquidCapital + pendingOperatingCash), "corporate_exit_cash"],
  ] as const) {
    if (amount === 0) continue;
    ledgerLegs.push({
      account: `corporation:${corporation}:${currency}`,
      amount,
      currencyCode: currency,
      anchorAmount: amount / rate,
      role: "primary",
    });
    ledgerLegs.push({
      account: `${amount > 0 ? "mint" : "sink"}:${reason}:${currency}`,
      amount: -amount,
      currencyCode: currency,
      anchorAmount: -amount / rate,
      role: "contra",
    });
  }
  return { legs, ledgerLegs };
}
