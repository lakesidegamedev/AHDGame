/**
 * A corporation's daily fixed costs above its sectors: marketing budget, logistics
 * budget, R&D budget and CEO salary, summed by corpLevelDailyCosts in the corp's
 * own currency. Sector maintenance and growth costs are not here; they net out
 * inside each sector's profit.
 */
/**
 * Corp-level daily operating costs used by the exchange snapshot, in the corp's
 * own currency.
 *
 * These are the corp-wide lines ABOVE the sectors: subtracted once, not per
 * sector. Sector maintenance and growth costs are excluded; they net out
 * inside each sector's profit.
 *
 * R&D is included here because the snapshot feeds taxable income and the
 * Income column, matching what the corporation page already charges.
 *
 * Deliberately NOT included: the dominance regulatory burden (per sector,
 * needs a national market-share lookup) and both pension legs (per scheme).
 * Those remain corporation-page only. Known, bounded narrowing.
 */
export interface CorpLevelCostInputs {
  marketingBudget?: number;
  logisticsBudget?: number;
  rdBudget?: number;
  ceoSalary?: number;
}

const finite = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function corpLevelDailyCosts(corp: CorpLevelCostInputs): number {
  return (
    finite(corp.marketingBudget) +
    finite(corp.logisticsBudget) +
    finite(corp.rdBudget) +
    finite(corp.ceoSalary)
  );
}
