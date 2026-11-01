import { playerIncomeTax } from "./incomeTaxTiers";
import { planTaxCollection, type TaxLiability } from "./taxCollection";

export interface IncomeDebt extends TaxLiability {
  id: string;
  turn: number;
  sourceFx: number;
}
/** Tax is reserved before debt service; the residual is the only spendable credit. */
export function planIncomePayout(input: {
  gross: number;
  income: number;
  capital: number;
  sourceFx: number;
  arrearsExempt?: number;
  incomeRates: { national: number; regional: number };
  capitalRates: { national: number; regional: number };
  debts: readonly IncomeDebt[];
}) {
  const { gross, income, capital, sourceFx } = input;
  if (
    ![gross, income, capital, sourceFx].every(Number.isFinite) ||
    gross < 0 ||
    income < 0 ||
    capital < 0 ||
    sourceFx <= 0 ||
    income + capital > gross + 1e-6
  )
    throw new Error("Invalid taxable payout");
  const incomeTax = playerIncomeTax(income, input.incomeRates.national, input.incomeRates.regional);
  const capitalTax = playerIncomeTax(
    capital,
    input.capitalRates.national,
    input.capitalRates.regional
  );
  const currentTax =
    incomeTax.federal + incomeTax.regional + capitalTax.federal + capitalTax.regional;
  const exempt = input.arrearsExempt ?? 0;
  if (!Number.isFinite(exempt) || exempt < 0 || exempt > gross - currentTax + 1e-6)
    throw new Error("Invalid arrears exemption");
  let net = Math.max(0, gross - currentTax - exempt);
  const arrears = [...input.debts]
    .sort((a, b) => a.turn - b.turn || a.id.localeCompare(b.id))
    .flatMap((debt) => {
      const payment = planTaxCollection(debt, net, debt.sourceFx, sourceFx);
      if (!(payment.walletDebit > 0)) return [];
      net = Math.max(0, net - payment.walletDebit);
      return [{ id: debt.id, ...payment }];
    });
  return {
    incomeTax,
    capitalTax,
    currentTax,
    arrears,
    arrearsPaid: gross - currentTax - exempt - net,
    net: net + exempt,
  };
}

/** Already taxed pass-through profit is exempt from a second personal levy. */
export function taxableDistribution(gross: number, capital = 0, taxedAtSource = 0, salary = 0) {
  if (
    ![gross, capital, taxedAtSource, salary].every(Number.isFinite) ||
    gross < 0 ||
    capital < 0 ||
    taxedAtSource < 0 ||
    salary < 0 ||
    salary > gross
  )
    throw new Error("Invalid distribution");
  const capitalAmount = Math.min(gross - salary, capital);
  const incomeAmount = gross - salary - capitalAmount;
  return {
    income: salary + Math.max(0, incomeAmount - taxedAtSource),
    capital: Math.max(0, capitalAmount - Math.max(0, taxedAtSource - incomeAmount)),
  };
}

/** Tax legs mirror the existing treasury cash and regional tax accounting. */
export function incomeTaxPaymentLegs(input: {
  characterId: string;
  countryId: string;
  currency: string;
  nationalCurrency: string;
  regionalCurrency: string;
  sourceFx: number;
  nationalFx: number;
  regionalFx: number;
  federal: number;
  regional: number;
  capitalGains: boolean;
  fundedTreasury: boolean;
}) {
  const { federal, regional, sourceFx } = input;
  if (
    ![federal, regional, sourceFx, input.nationalFx, input.regionalFx].every(Number.isFinite) ||
    federal < 0 ||
    regional < 0 ||
    sourceFx <= 0 ||
    input.nationalFx <= 0 ||
    input.regionalFx <= 0
  )
    throw new Error("Invalid tax ledger payment");
  const character = "character:" + input.characterId + ":" + input.currency;
  const legs = [
    {
      account: character,
      amount: -federal - regional,
      currencyCode: input.currency,
      anchorAmount: (-federal - regional) / sourceFx,
      role: "primary" as "primary" | "contra",
    },
  ];
  if (federal > 0)
    legs.push({
      account: "government:" + input.countryId + ":" + input.nationalCurrency,
      amount: (federal / sourceFx) * input.nationalFx,
      currencyCode: input.nationalCurrency,
      anchorAmount: federal / sourceFx,
      role: "primary",
    });
  if (regional > 0)
    legs.push({
      account:
        (input.capitalGains ? "sink:regional_capital_gains_tax:" : "sink:regional_income_tax:") +
        input.regionalCurrency,
      amount: (regional / sourceFx) * input.regionalFx,
      currencyCode: input.regionalCurrency,
      anchorAmount: regional / sourceFx,
      role: "contra",
    });
  const cash =
    input.fundedTreasury && federal > 0
      ? [
          {
            account: "government_cash:" + input.countryId + ":" + input.nationalCurrency,
            amount: (federal / sourceFx) * input.nationalFx,
            currencyCode: input.nationalCurrency,
            anchorAmount: federal / sourceFx,
            role: "primary",
          },
          {
            account: character,
            amount: -federal,
            currencyCode: input.currency,
            anchorAmount: -federal / sourceFx,
            role: "contra",
          },
        ]
      : [];
  return { legs, cash };
}
