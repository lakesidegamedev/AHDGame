import type { CountryId } from "@/lib/constants/countries";
import type { IncomeTier, IncomeTaxRates } from "./incomeTaxTiers";
import { incomeTaxRate, playerIncomeTax } from "./incomeTaxTiers";
import {
  capitalGainsTaxRate,
  type CapitalGainsTaxRates,
  type StockTaxReceipt,
} from "./capitalGainsTax";

/** Frozen jurisdiction and rates. Amounts are in tax-currency units, not anchor units. */
export interface StockWithholdingContext {
  taxStartTurn?: number;
  tier: IncomeTier;
  countryId: CountryId;
  currency: string;
  sourcePath: string;
  sourceFx: number;
  walletFx: number;
  nationalBudgetId: string;
  nationalCurrency: string;
  nationalFx: number;
  stateId: string;
  regionalCurrency: string;
  regionalFx: number;
  nationalRates: CapitalGainsTaxRates;
  regionalRates: IncomeTaxRates & CapitalGainsTaxRates;
}
export interface StockWithholding {
  context: StockWithholdingContext;
  income: ReturnType<typeof playerIncomeTax>;
  capital: ReturnType<typeof playerIncomeTax>;
  walletAmount: number;
}

export const netStockProceeds = (amount: number, receipt?: StockTaxReceipt) =>
  amount - (receipt?.withholding?.walletAmount ?? 0);

/** Sale responses use anchor amounts while the atomic credit uses wallet units. */
export function stockSaleDeductions(
  proceedsAnchor: number,
  proceedsWallet: number,
  receipt?: StockTaxReceipt
) {
  const withheldTax =
    proceedsWallet > 0
      ? ((receipt?.withholding?.walletAmount ?? 0) * proceedsAnchor) / proceedsWallet
      : 0;
  return { withheldTax, netProceeds: proceedsAnchor - withheldTax };
}

export function stockWithholdingApplies(
  receipt: StockTaxReceipt,
  context: StockWithholdingContext
): boolean {
  if (
    context.taxStartTurn !== undefined &&
    (!Number.isSafeInteger(context.taxStartTurn) || context.taxStartTurn < 0)
  )
    throw new Error("Invalid stock tax start turn");
  return context.taxStartTurn === undefined || receipt.assessmentTurn >= context.taxStartTurn;
}

export function stockSaleWithholding(
  receipt: StockTaxReceipt,
  context: StockWithholdingContext
): StockWithholding {
  if (!stockWithholdingApplies(receipt, context))
    throw new Error("Stock sale predates tax eligibility");
  if (
    ![context.sourceFx, context.walletFx, context.nationalFx, context.regionalFx].every(
      (n) => Number.isFinite(n) && n > 0
    )
  )
    throw new Error("Invalid stock withholding exchange rate");
  const factor = context.sourceFx / context.walletFx;
  const income = playerIncomeTax(
    receipt.incomeAmount * factor,
    incomeTaxRate(context.nationalRates, context.tier),
    incomeTaxRate(context.regionalRates, context.tier)
  );
  const capital = playerIncomeTax(
    receipt.capitalAmount * factor,
    capitalGainsTaxRate(context.nationalRates, context.tier),
    capitalGainsTaxRate(context.regionalRates, context.tier)
  );
  return {
    context,
    income,
    capital,
    walletAmount: (income.federal + income.regional + capital.federal + capital.regional) / factor,
  };
}
