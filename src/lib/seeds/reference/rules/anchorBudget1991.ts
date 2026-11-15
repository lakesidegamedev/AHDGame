import type { FiscalAnchor1991 } from "@/lib/constants/fiscalAnchors1991";
import { rebaseBudgetNominals } from "./rebaseBudgetNominals";

/**
 * Re-anchors a seeded national budget to sourced 1991 aggregates.
 *
 * Authored rows used 1979 local currency (or a 1979-rate game unit), so their
 * nominals were off by 1979-to-1991 inflation and by the 1979 exchange rate.
 * Pure: takes the authored row and the sourced anchor, returns the 1991 row.
 *
 *  1. GDP becomes sourced 1991 nominal GDP, and every other nominal (other
 *     revenue, debt, ceiling, spending lines, state grants) scales by the same
 *     factor, so authored fiscal SHARES hold.
 *  2. Where the anchor has IMF general government gross debt, principal is set
 *     to that share of GDP and the ceiling keeps its authored headroom ratio.
 *  3. `deriveSpendingFromTotal` is for rows whose spending composition is
 *     1979 only. It rescales categorised lines and state grants together so
 *     that they plus the interest bill equal the IMF expenditure share of GDP,
 *     keeping the 1979 mix. Rows authored for 1991 keep their own shares.
 */
interface BudgetRow {
  gdp: number;
  otherRevenue: number;
  debt: { principal: number; ceiling: number; interestRate: number };
  baselineSpendingByCategory: Record<string, number>;
  baselineStateGrants: number;
}

export interface AnchorBudgetOptions {
  deriveSpendingFromTotal?: boolean;
}

export function anchorBudget1991<T extends BudgetRow>(
  config: T,
  anchor: Pick<FiscalAnchor1991, "govExpenditurePctGdp" | "govGrossDebtPctGdp">,
  gdp: number,
  options: AnchorBudgetOptions = {}
): T {
  let row = rebaseBudgetNominals(config, gdp);

  if (anchor.govGrossDebtPctGdp != null) {
    const principal = (anchor.govGrossDebtPctGdp / 100) * gdp;
    const headroom = row.debt.principal > 0 ? row.debt.ceiling / row.debt.principal : 1;
    row = { ...row, debt: { ...row.debt, principal, ceiling: principal * headroom } };
  }

  if (options.deriveSpendingFromTotal) {
    if (anchor.govExpenditurePctGdp == null) {
      throw new Error("deriveSpendingFromTotal needs a sourced expenditure share");
    }
    const interest = row.debt.principal * row.debt.interestRate;
    const target = (anchor.govExpenditurePctGdp / 100) * gdp - interest;
    const current =
      Object.values(row.baselineSpendingByCategory).reduce((sum, v) => sum + v, 0) +
      row.baselineStateGrants;
    if (target <= 0 || current <= 0) {
      throw new Error("Expenditure share leaves no room above the interest bill");
    }
    const k = target / current;
    row = {
      ...row,
      baselineSpendingByCategory: Object.fromEntries(
        Object.entries(row.baselineSpendingByCategory).map(([key, v]) => [key, v * k])
      ),
      baselineStateGrants: row.baselineStateGrants * k,
    };
  }
  return row;
}

/**
 * Scales authored regional GDP (millions of local currency) to a national
 * nominal total, keeping each region's authored share. The last region absorbs
 * the rounding so the sum is exact.
 */
export function scaleRegionalGdpToNational<T extends { gdp: number }>(
  regions: readonly T[],
  nationalGdpUnits: number
): T[] {
  const nationalMillions = Math.round(nationalGdpUnits / 1_000_000);
  const total = regions.reduce((sum, r) => sum + r.gdp, 0);
  if (!(total > 0) || !(nationalMillions > 0)) {
    throw new Error("Regional GDP scaling needs positive regional and national totals");
  }
  let assigned = 0;
  return regions.map((region, i) => {
    const gdp =
      i === regions.length - 1
        ? nationalMillions - assigned
        : Math.round((nationalMillions * region.gdp) / total);
    assigned += gdp;
    return { ...region, gdp };
  });
}
