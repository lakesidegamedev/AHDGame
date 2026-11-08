/**
 * Scale guard: a preset's money values must sit in bands relative to that
 * preset's own GDP, population and era price level. A value carried over from
 * another era, or left in another era's units, lands outside them.
 */

export interface Band {
  readonly min: number;
  readonly max: number;
}

/** National programme spending plus state grants, as a share of GDP. */
export const BUDGET_SPENDING_GDP_BAND: Band = { min: 0.08, max: 0.7 };
/** Outstanding sovereign debt as a share of GDP. */
export const SOVEREIGN_DEBT_GDP_BAND: Band = { min: 0, max: 3 };
/** One spending category's cost per head over GDP per head. */
export const PROGRAM_COST_PER_CAPITA_INCOME_MAX = 0.35;
/** A law's revenue per head over GDP per head, for any option. */
export const LAW_REVENUE_PER_CAPITA_INCOME_MAX = 0.5;
/** Dollar GDP per head relative to the US in the same preset. */
export const DOLLAR_INCOME_VS_US_BAND: Band = { min: 0.002, max: 3 };
/** Sum of regional GDP over national GDP. */
export const REGIONAL_GDP_BAND: Band = { min: 0.5, max: 2 };
/** Sum of regional population over national population. */
export const REGIONAL_POPULATION_BAND: Band = { min: 0.8, max: 1.25 };
/** Commodity price scale over the era price level. */
export const COMMODITY_PRICE_LEVEL_BAND: Band = { min: 2 / 3, max: 1.5 };

export function inBand(value: number, band: Band): boolean {
  return Number.isFinite(value) && value >= band.min && value <= band.max;
}

/** The budget figures the scale guard reads, in the country's seed currency. */
export interface BudgetScaleInput {
  readonly countryId: string;
  readonly gdp: number;
  readonly population: number;
  readonly spendingByCategory: Readonly<Record<string, number>>;
  readonly stateGrants: number;
  readonly debtPrincipal: number;
  readonly revenuePerCapitaByLaw: Readonly<Record<string, readonly number[]>>;
  /** Local currency per USD, when the preset has a rate for the country. */
  readonly lcuPerUsd?: number;
}

export interface ScaleFinding {
  readonly countryId: string;
  readonly check: string;
  readonly detail: string;
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const bandText = (band: Band, format: (v: number) => string) =>
  `${format(band.min)} to ${format(band.max)}`;

/** Budget-level checks for one country in one preset. */
export function checkBudgetScale(input: BudgetScaleInput): ScaleFinding[] {
  const findings: ScaleFinding[] = [];
  const { countryId, gdp, population } = input;
  if (!(gdp > 0) || !(population > 0)) {
    return [{ countryId, check: "budget", detail: "GDP and population must be positive" }];
  }
  const spending =
    Object.values(input.spendingByCategory).reduce((sum, v) => sum + v, 0) + input.stateGrants;
  const spendShare = spending / gdp;
  if (!inBand(spendShare, BUDGET_SPENDING_GDP_BAND)) {
    findings.push({
      countryId,
      check: "budgetSpending",
      detail: `spending is ${pct(spendShare)} of GDP, outside ${bandText(BUDGET_SPENDING_GDP_BAND, pct)}`,
    });
  }
  const debtShare = input.debtPrincipal / gdp;
  if (!inBand(debtShare, SOVEREIGN_DEBT_GDP_BAND)) {
    findings.push({
      countryId,
      check: "sovereignDebt",
      detail: `debt is ${pct(debtShare)} of GDP, outside ${bandText(SOVEREIGN_DEBT_GDP_BAND, pct)}`,
    });
  }
  const gdpPerCapita = gdp / population;
  for (const [category, amount] of Object.entries(input.spendingByCategory)) {
    const share = amount / population / gdpPerCapita;
    if (share > PROGRAM_COST_PER_CAPITA_INCOME_MAX) {
      findings.push({
        countryId,
        check: "programCostPerCapita",
        detail: `${category} costs ${pct(share)} of GDP per head (max ${pct(PROGRAM_COST_PER_CAPITA_INCOME_MAX)})`,
      });
    }
  }
  for (const [law, perCapita] of Object.entries(input.revenuePerCapitaByLaw)) {
    const worst = Math.max(0, ...perCapita) / gdpPerCapita;
    if (worst > LAW_REVENUE_PER_CAPITA_INCOME_MAX) {
      findings.push({
        countryId,
        check: "lawRevenuePerCapita",
        detail: `${law} raises up to ${pct(worst)} of GDP per head (max ${pct(LAW_REVENUE_PER_CAPITA_INCOME_MAX)})`,
      });
    }
  }
  return findings;
}

/**
 * Dollar income check across a preset: every country's GDP per head in USD,
 * relative to the US, sits in {@link DOLLAR_INCOME_VS_US_BAND}. Countries
 * without a rate are skipped; the rate gap is reported by the coverage check.
 */
export function checkDollarIncome(inputs: readonly BudgetScaleInput[]): ScaleFinding[] {
  const us = inputs.find((input) => input.countryId === "US");
  if (!us) return [];
  const usIncome = us.gdp / us.population;
  const findings: ScaleFinding[] = [];
  for (const input of inputs) {
    if (input.countryId === "US" || !(input.lcuPerUsd && input.lcuPerUsd > 0)) continue;
    const ratio = input.gdp / input.population / input.lcuPerUsd / usIncome;
    if (!inBand(ratio, DOLLAR_INCOME_VS_US_BAND)) {
      findings.push({
        countryId: input.countryId,
        check: "dollarIncome",
        detail: `GDP per head is ${ratio.toPrecision(3)}x the US at the seeded rate, outside ${DOLLAR_INCOME_VS_US_BAND.min} to ${DOLLAR_INCOME_VS_US_BAND.max}`,
      });
    }
  }
  return findings;
}

export interface RegionalTotalsInput {
  readonly countryId: string;
  readonly nationalGdp: number;
  readonly nationalPopulation: number;
  /** Sum of regional GDP, in millions of the seed currency. */
  readonly regionalGdpMillions: number;
  readonly regionalPopulation: number;
  /** Whether seeding rescales regional GDP to the national total. */
  readonly gdpReconciledAtSeed: boolean;
}

/** Regional rosters must add up to their own country's national totals. */
export function checkRegionalTotals(input: RegionalTotalsInput): ScaleFinding[] {
  const findings: ScaleFinding[] = [];
  if (input.nationalPopulation > 0 && input.regionalPopulation > 0) {
    const ratio = input.regionalPopulation / input.nationalPopulation;
    if (!inBand(ratio, REGIONAL_POPULATION_BAND)) {
      findings.push({
        countryId: input.countryId,
        check: "regionalPopulation",
        detail: `regions hold ${ratio.toPrecision(3)}x the national population`,
      });
    }
  }
  if (!input.gdpReconciledAtSeed && input.nationalGdp > 0 && input.regionalGdpMillions > 0) {
    const ratio = (input.regionalGdpMillions * 1_000_000) / input.nationalGdp;
    if (!inBand(ratio, REGIONAL_GDP_BAND)) {
      findings.push({
        countryId: input.countryId,
        check: "regionalGdp",
        detail: `regional GDP sums to ${ratio.toPrecision(3)}x national GDP`,
      });
    }
  }
  return findings;
}

/** Commodity prices must follow the era's price level. */
export function checkCommodityPriceLevel(
  commodityScale: number,
  eraPriceLevel: number
): ScaleFinding[] {
  const ratio = commodityScale / eraPriceLevel;
  if (inBand(ratio, COMMODITY_PRICE_LEVEL_BAND)) return [];
  return [
    {
      countryId: "*",
      check: "commodityPriceLevel",
      detail: `commodity prices are scaled ${commodityScale.toPrecision(3)} against an era price level of ${eraPriceLevel.toPrecision(3)}`,
    },
  ];
}
