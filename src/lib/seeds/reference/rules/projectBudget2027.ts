import { rebaseBudgetNominals } from "./rebaseBudgetNominals";

/**
 * Projects a carried-forward national budget row onto sourced 2027 national
 * figures. The row keeps its spending mix and its coverage of general
 * government; its size, debt, interest, revenue gap and macro factors become
 * the 2027 ones. Pure: plain data in, plain data out.
 */

/** General government shares of GDP, in percent, for one year. */
export interface GeneralGovernmentShares {
  revenue: number;
  expenditure: number;
  primaryBalance: number;
  overallBalance: number;
}

export interface NationalFigures2027 {
  population: number;
  /** Nominal GDP in the row's seed currency. */
  gdp: number;
  /** General government gross debt, percent of GDP. */
  grossDebt: number;
  realGrowth: number;
  inflation: number;
  fiscal: GeneralGovernmentShares;
  /** The same shares for the year the carried row was calibrated on. */
  reference: GeneralGovernmentShares & { year: number };
  /** A category set to its own sourced amount; the rest of the mix fills the remainder. */
  pinnedCategory?: { key: string; amount: number };
}

interface BudgetRow {
  population: number;
  gdp: number;
  otherRevenue: number;
  debt: { principal: number; ceiling: number; interestRate: number };
  baselineSpendingByCategory: Record<string, number>;
  baselineStateGrants: number;
  economicFactors: { gdpGrowth: number; wageGrowth: number; inflationRate: number };
  policyRevenueConfigs?: Array<{ annualRevenuePerCapitaByOptionIndex?: number[] }>;
}

const interestShare = (shares: GeneralGovernmentShares) =>
  shares.primaryBalance - shares.overallBalance;

const primaryExpenditure = (shares: GeneralGovernmentShares) =>
  shares.expenditure - interestShare(shares);

const sum = (values: Iterable<number>) => [...values].reduce((total, v) => total + v, 0);

/**
 * `modeledRevenueGdpShare` is the row's modelled total revenue over GDP after
 * the rebase, from the budget builder: the tax laws carry over unchanged, so
 * the change in the revenue ratio lands in other revenue.
 */
export function projectBudget2027<T extends BudgetRow>(
  config: T,
  figures: NationalFigures2027,
  modeledRevenueGdpShare: number
): T {
  const { gdp } = figures;
  if (!(figures.population > 0) || !(figures.grossDebt > 0)) {
    throw new Error("2027 national figures need a positive population and debt");
  }
  const rebased = rebaseBudgetNominals(config, gdp);
  const incomeScale = config.population / figures.population;

  const principal = (figures.grossDebt / 100) * gdp;
  const headroom = config.debt.principal > 0 ? config.debt.ceiling / config.debt.principal : 1.25;
  const interestRate = Number(
    (Math.max(0, interestShare(figures.fiscal)) / figures.grossDebt).toFixed(4)
  );

  const programme =
    sum(Object.values(rebased.baselineSpendingByCategory)) + rebased.baselineStateGrants;
  const coverage = programme / gdp / (primaryExpenditure(figures.reference) / 100);
  const target = coverage * (primaryExpenditure(figures.fiscal) / 100) * gdp;
  const pinned = figures.pinnedCategory;
  const pinnedAmount = pinned ? (rebased.baselineSpendingByCategory[pinned.key] ?? 0) : 0;
  if (pinned && !(pinned.key in rebased.baselineSpendingByCategory)) {
    throw new Error(`Pinned category ${pinned.key} is not in the budget row`);
  }
  const fill = (target - (pinned?.amount ?? 0)) / (programme - pinnedAmount);
  if (!(fill > 0)) throw new Error("2027 expenditure leaves no room for the spending mix");
  const spending = Object.fromEntries(
    Object.entries(rebased.baselineSpendingByCategory).map(([key, amount]) => [
      key,
      pinned?.key === key ? pinned.amount : amount * fill,
    ])
  );

  const revenueChange = figures.fiscal.revenue / figures.reference.revenue - 1;
  const otherRevenue = Math.max(
    0,
    rebased.otherRevenue + revenueChange * modeledRevenueGdpShare * gdp
  );

  return {
    ...rebased,
    population: figures.population,
    otherRevenue,
    debt: { ...rebased.debt, principal, ceiling: principal * headroom, interestRate },
    baselineSpendingByCategory: spending,
    baselineStateGrants: rebased.baselineStateGrants * fill,
    economicFactors: {
      ...rebased.economicFactors,
      gdpGrowth: figures.realGrowth,
      inflationRate: figures.inflation,
      wageGrowth: Number((figures.inflation + figures.realGrowth / 2).toFixed(1)),
    },
    ...(rebased.policyRevenueConfigs && {
      policyRevenueConfigs: rebased.policyRevenueConfigs.map((revenue) => ({
        ...revenue,
        ...(revenue.annualRevenuePerCapitaByOptionIndex && {
          annualRevenuePerCapitaByOptionIndex: revenue.annualRevenuePerCapitaByOptionIndex.map(
            (amount) => amount * incomeScale
          ),
        }),
      })),
    }),
  };
}
