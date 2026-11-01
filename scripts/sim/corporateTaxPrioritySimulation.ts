/** Synthetic scenarios only. Currency-scaled corporate withholding and arrears recovery. */
import {
  planCorporateTaxPriority,
  corporatePayoutCash,
} from "../../src/lib/turn/corporation/rules/corporateTaxPriority";
import { COUNTRY_CURRENCY_MAP } from "../../src/lib/constants/currencies";
const results = [];
for (const [country, currency] of Object.entries(COUNTRY_CURRENCY_MAP)) {
  const fx = currency === "JPY" ? 150 : currency === "GBP" ? 0.8 : 1;
  if (
    corporatePayoutCash({ cash: 100 * fx, income: 80 * fx, alreadySettled: 100 * fx }) !==
      80 * fx ||
    corporatePayoutCash({ cash: 0, income: -10 * fx, alreadySettled: 0 }) !== 0
  )
    throw new Error("Optional payout cash reserve failed: " + country);
  let cash = 0,
    taxDebt = 250,
    operatingDebt = 50 * fx,
    taxes = 0,
    distributions = 0;
  let clearedTurn: number | null = null;
  for (let turn = 1; turn <= 48; turn++) {
    const opening = cash;
    const plan = planCorporateTaxPriority({
      cash,
      pending: 100 * fx,
      netIncome: -30 * fx,
      localPerAnchor: fx,
      currentTax: { [country]: 30 },
      priorTax: { [country]: taxDebt },
      priorOperating: operatingDebt,
      distributionRequested: 60 * fx,
    });
    const tax = (plan.currentPaid[country] ?? 0) + (plan.priorTaxPaid[country] ?? 0);
    if (
      Math.abs(
        opening + 100 * fx - plan.cash - tax * fx - plan.priorOperatingPaid - plan.distributionPaid
      ) > 1e-6
    )
      throw new Error("Cash conservation failed: " + country);
    cash = plan.cash;
    taxDebt += (plan.currentUnpaid[country] ?? 0) - (plan.priorTaxPaid[country] ?? 0);
    operatingDebt -= plan.priorOperatingPaid;
    taxes += tax;
    distributions += plan.distributionPaid / fx;
    if (taxDebt < 1e-8 && operatingDebt < 1e-8 && clearedTurn === null) clearedTurn = turn;
    if ((taxDebt > 1e-8 || operatingDebt > 1e-8) && plan.distributionPaid > 1e-8)
      throw new Error("Distribution jumped ahead of arrears");
  }
  if (clearedTurn !== 5) throw new Error("Expected fifth-turn clearance: " + country);
  const shortage = planCorporateTaxPriority({
    cash: 10 * fx,
    pending: 0,
    netIncome: -50 * fx,
    localPerAnchor: fx,
    currentTax: { [country]: 20 },
    priorTax: {},
    priorOperating: 0,
  });
  if (
    Math.abs(shortage.currentUnpaid[country] - 10) > 1e-8 ||
    Math.abs(shortage.operatingUnpaid / fx - 30) > 1e-8
  )
    throw new Error("Shortfall not preserved: " + country);
  results.push({
    country,
    currency,
    clearedTurn,
    taxCollectedAnchor: taxes,
    spendableCashAnchor: cash / fx,
    householdDistributionsAnchor: distributions,
    shortfallTaxAnchor: shortage.currentUnpaid[country],
  });
}
console.log(
  JSON.stringify(
    {
      scenario:
        "100 anchor funded profit, 30 current tax, 250 old tax debt, 50 operating debt, optional 60 household distribution each turn",
      countries: results.length,
      turns: 48,
      results,
    },
    null,
    2
  )
);
