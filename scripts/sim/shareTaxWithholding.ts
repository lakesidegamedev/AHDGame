/** Synthetic settlement replay. No credentials, database or player records. */
import assert from "node:assert/strict";
import {
  stockSaleWithholding,
  type StockWithholdingContext,
} from "../../src/lib/budget/rules/stockWithholding";
import { outstandingTax, planTaxCollection } from "../../src/lib/budget/rules/taxCollection";

let scenarios = 0;
let maxConservationError = 0;
const examples: unknown[] = [];
for (const [countryId, currency, fx] of [
  ["US", "USD", 1],
  ["UK", "GBP", 0.75],
  ["JP", "JPY", 118.6],
] as const) {
  for (const forexEnabled of [false, true]) {
    for (const tier of ["low", "middle", "high"] as const) {
      // Illustrative enacted rates, intentionally distinct across tiers and tax kinds.
      const context: StockWithholdingContext = {
        countryId,
        currency,
        tier,
        sourcePath: forexEnabled ? "currencyBalances.personal." + currency : "cashOnHand",
        sourceFx: fx,
        walletFx: forexEnabled ? fx : 1,
        nationalBudgetId: countryId,
        nationalCurrency: currency,
        nationalFx: fx,
        stateId: countryId + "_test",
        regionalCurrency: currency,
        regionalFx: fx,
        nationalRates: {
          incomeTaxLow: 10,
          incomeTaxMiddle: 20,
          incomeTaxHigh: 30,
          capitalGainsTaxLow: 5,
          capitalGainsTaxMiddle: 15,
          capitalGainsTaxHigh: 25,
        },
        regionalRates: { incomeTax: 5 },
      };
      for (const gainFraction of [0, 0.001, 0.1, 0.5, 0.99, 1]) {
        for (const oldDebt of [0, 100, 100000, 72000000000]) {
          const gross = 10000 * context.walletFx;
          const held = stockSaleWithholding(
            {
              version: 1,
              assessmentTurn: 2,
              incomeAmount: (gross * gainFraction) / 2,
              capitalAmount: (gross * gainFraction) / 2,
            },
            context
          );
          const net = gross - held.walletAmount;
          assert(net >= 0);
          const debt = { federal: oldDebt * 0.8, regional: oldDebt * 0.2 };
          const first = planTaxCollection(debt, net, fx, context.walletFx);
          const unpaid = outstandingTax({
            ...debt,
            collectedFederal: first.slice.federal,
            collectedRegional: first.slice.regional,
          });
          const final = planTaxCollection(
            {
              ...debt,
              collectedFederal: first.slice.federal,
              collectedRegional: first.slice.regional,
            },
            1e15,
            fx,
            context.walletFx
          );
          const remainingCash = net - first.walletDebit;
          const error = Math.abs(gross - remainingCash - first.walletDebit - held.walletAmount);
          maxConservationError = Math.max(maxConservationError, error);
          assert(error < 1e-6);
          assert(remainingCash >= -1e-6);
          assert(
            Math.abs(
              unpaid.federal + unpaid.regional - final.slice.federal - final.slice.regional
            ) < 1e-5
          );
          assert(final.slice.fullyPaid);
          if (forexEnabled && tier === "middle" && gainFraction === 0.5 && oldDebt === 100000)
            examples.push({
              countryId,
              currency,
              gross,
              withheld: held.walletAmount,
              net,
              oldDebtCollected: first.slice.federal + first.slice.regional,
              arrearsRemaining: unpaid.federal + unpaid.regional,
            });
          scenarios++;
        }
      }
    }
  }
}
console.log(
  JSON.stringify(
    {
      scenarios,
      maxConservationError,
      examples,
      assumptions:
        "Synthetic prices and enacted rates; validates settlement mechanics, not live player balances or current national rates.",
    },
    null,
    2
  )
);
