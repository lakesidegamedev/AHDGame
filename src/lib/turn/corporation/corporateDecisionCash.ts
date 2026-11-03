import type { Corporation } from "@/lib/db/types/corporation";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CorpSnapshot } from "./types";
import { corporateDecisionCash } from "./rules/corporateTaxPriority";

/** Adapt virtual producer balances into the unencumbered cash the AI can spend. */
export function corporationsWithReservedTaxCash(
  corporations: Corporation[],
  snapshots: readonly CorpSnapshot[],
  rates: ReadonlyMap<CurrencyCode, number>,
  enabled: boolean
): Corporation[] {
  const cashSnapshots = new Map(snapshots.map((row) => [row.corpId.toHexString(), row]));
  return corporations.map((corp) => {
    const snapshot = cashSnapshots.get(corp._id.toHexString());
    if (!enabled || !snapshot?.operatingCashCurrency || !snapshot.operatingCashLocalPerAnchor)
      return corp;
    const pending = corp.pendingOperatingCash ?? 0;
    return {
      ...corp,
      liquidCapital: corporateDecisionCash({
        cash: corp.liquidCapital - pending,
        pending,
        netIncome: snapshot.operatingCashIncomeLocal ?? 0,
        localPerAnchor: snapshot.operatingCashLocalPerAnchor,
        currentTax: Object.fromEntries(snapshot.federalTaxByCountryAnchor ?? []),
        priorTax: corp.federalTaxArrearsAnchorByCountry ?? {},
        priorOperating: 0,
        priorOperatingByCurrency: Object.fromEntries(
          Object.entries(corp.operatingCashArrearsByCurrency ?? {})
            .filter(([, amount]) => amount > 0)
            .map(([currency, amount]) => [
              currency,
              {
                amount,
                localPerAnchor:
                  rates.get(currency as CurrencyCode) ??
                  (currency === snapshot.operatingCashCurrency
                    ? (snapshot.operatingCashLocalPerAnchor ?? NaN)
                    : NaN),
              },
            ])
        ),
      }),
    };
  });
}
