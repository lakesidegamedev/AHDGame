import { incomeTaxRate } from "@/lib/budget/rules/incomeTaxTiers";
import { capitalGainsTaxRate } from "@/lib/budget/rules/capitalGainsTax";
import type { StockTaxReceipt } from "@/lib/budget/rules/capitalGainsTax";
import type { StockWithholdingContext } from "@/lib/budget/rules/stockWithholding";

export interface SaleTaxBreakdown {
  /** Cost of the lots being sold, in the sale's display currency. */
  costBasis: number;
  /** Gain on lots held under the long-term threshold, taxed at the income rate. */
  shortTermGain: number;
  /** Gain on lots past the long-term threshold, taxed at the capital gains rate. */
  longTermGain: number;
  /** National plus regional percent on short-term gain. */
  shortTermRatePct: number;
  /** National plus regional percent on long-term gain. */
  longTermRatePct: number;
  shortTermTax: number;
  longTermTax: number;
}

/**
 * Splits a frozen sale receipt into the figures the withheld tax is computed
 * from, so the preview shows the same gain and rates the sale applies.
 * `withheldTax` is the sale's total in display units and fixes the scale.
 */
export function buildSaleTaxBreakdown(
  receipt: StockTaxReceipt,
  context: StockWithholdingContext,
  withheldTax: number
): SaleTaxBreakdown | null {
  const withholding = receipt.withholding;
  if (!withholding) return null;
  const toDisplay = 1 / context.walletFx;
  const factor = context.sourceFx / context.walletFx;
  const taxToDisplay =
    withholding.walletAmount > 0 ? withheldTax / withholding.walletAmount : toDisplay;
  const part = (p: { federal: number; regional: number }) =>
    ((p.federal + p.regional) / factor) * taxToDisplay;
  return {
    costBasis: receipt.costBasisAnchor ?? 0,
    shortTermGain: receipt.incomeAmount * toDisplay,
    longTermGain: receipt.capitalAmount * toDisplay,
    shortTermRatePct:
      incomeTaxRate(context.nationalRates, context.tier) +
      incomeTaxRate(context.regionalRates, context.tier),
    longTermRatePct:
      capitalGainsTaxRate(context.nationalRates, context.tier) +
      capitalGainsTaxRate(context.regionalRates, context.tier),
    shortTermTax: part(withholding.income),
    longTermTax: part(withholding.capital),
  };
}
