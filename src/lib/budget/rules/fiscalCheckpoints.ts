/**
 * Long-run fiscal checkpoints for the 2027 world. Steps one country's
 * national accounts a fiscal year at a time on the authored macro arc
 * (trend growth, target inflation, neutral policy rate) and the fiscal
 * stabilizer, and reports GDP, growth, inflation, policy rate, debt ratio and
 * the interest share of revenue at fixed years.
 *
 * Pure: the macro arc arrives as a function, nothing is read or written. The
 * table is an offline reading of the rules with the opening books, not a
 * forecast. Revenue and primary spending hold their opening share of GDP; the
 * stabilizer moves them when the primary deficit is out of hand.
 */
import { NPP_CHAIR_INFLATION_COEF, NPP_CHAIR_RATE_FLOOR } from "@/lib/db/types/centralBank";
import {
  nextInterestSpiralYears,
  planFiscalConsolidation,
  shouldRestructureForInterest,
} from "./fiscalStabilizer";

export const FISCAL_CHECKPOINT_YEARS = [2027, 2030, 2035, 2040, 2045, 2050] as const;

export interface MacroPoint {
  /** Annual real growth, percent. */
  trendGrowth: number;
  /** Annual inflation, percent. */
  inflation: number;
  /** Central bank inflation target, percent. Absent reads as `inflation`. */
  targetInflation?: number;
  /** Neutral policy (prime) rate, percent; the rate when inflation is on target. */
  policyRate: number;
}

/**
 * The rate the central bank sets: the neutral rate plus the inflation gap at
 * the same coefficient the autonomous chairs use. On target it is the neutral
 * rate; it is floored at the chair floor once a gap is in play.
 */
export function centralBankPolicyRate(macro: MacroPoint): number {
  const gap = macro.inflation - (macro.targetInflation ?? macro.inflation);
  if (gap === 0) return macro.policyRate;
  return Math.max(
    macro.policyRate + NPP_CHAIR_INFLATION_COEF * gap,
    Math.min(macro.policyRate, NPP_CHAIR_RATE_FLOOR)
  );
}

export interface FiscalOpening {
  /** Nominal GDP, local currency. */
  gdp: number;
  revenue: number;
  /** Total spending including debt interest. */
  spending: number;
  debtInterest: number;
  debt: number;
  /** Average coupon on the opening debt, as a fraction. */
  effectiveRate: number;
}

export interface FiscalPolicy {
  /** Added to revenue, as a share of GDP. */
  revenueGdpShareDelta: number;
  /** Added to primary spending, as a share of GDP. */
  primarySpendingGdpShareDelta: number;
  /** Years for the whole debt stock to roll over at the market rate. */
  averageMaturityYears: number;
}

export const DEFAULT_FISCAL_POLICY: FiscalPolicy = {
  revenueGdpShareDelta: 0,
  primarySpendingGdpShareDelta: 0,
  averageMaturityYears: 7,
};

/** Debt ratio above which the stabilizer reads the country as distressed. */
export const DISTRESS_DEBT_RATIO = 0.9;
/** Debt ratio a sovereign restructuring leaves behind. */
export const RESTRUCTURED_DEBT_RATIO = 0.6;
/** Market premium over the policy rate rises this many points per unit of debt ratio above 60%. */
export const TERM_PREMIUM_PER_DEBT_RATIO = 2;
const TERM_PREMIUM_BASE = 0.5;
const TERM_PREMIUM_MAX = 8;
const TAX_REFERENCE_RATE = 20;
/** Primary surplus above this share of GDP is spent down in the fixture. */
export const SURPLUS_SPEND_FLOOR = 0.03;

export interface FiscalRow {
  year: number;
  gdp: number;
  growth: number;
  inflation: number;
  policyRate: number;
  /** Debt over GDP, percent. */
  debtRatio: number;
  /** Debt interest over revenue, percent. */
  interestShareOfRevenue: number;
  /** Primary balance over GDP, percent. */
  primaryBalance: number;
}

export interface FiscalEvent {
  year: number;
  kind: "consolidation" | "restructuring" | "surplus-spend";
  detail: number;
}

/** One fiscal year with its full flow, for stock-flow checks. */
export interface FiscalYearFlow {
  year: number;
  debtOpening: number;
  revenue: number;
  primarySpending: number;
  interest: number;
  deficit: number;
  /** Debt retired at maturity and re-issued the same year. */
  refinanced: number;
  debtClosing: number;
  /** Debt written off by a restructuring at the year close. */
  writtenOff: number;
}

export interface FiscalRun {
  rows: FiscalRow[];
  flows: FiscalYearFlow[];
  events: FiscalEvent[];
}

const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);

export function projectFiscalCheckpoints(input: {
  opening: FiscalOpening;
  macroAt: (year: number) => MacroPoint;
  startYear?: number;
  endYear?: number;
  policy?: Partial<FiscalPolicy>;
}): FiscalRun {
  const policy: FiscalPolicy = { ...DEFAULT_FISCAL_POLICY, ...input.policy };
  const start = input.startYear ?? 2027;
  const end = input.endYear ?? 2050;
  const { opening } = input;
  const primarySpendingShare =
    ratio(opening.spending - opening.debtInterest, opening.gdp) +
    policy.primarySpendingGdpShareDelta;
  const revenueShare = ratio(opening.revenue, opening.gdp) + policy.revenueGdpShareDelta;

  let gdp = opening.gdp;
  let debt = opening.debt;
  let effectiveRate = opening.effectiveRate;
  let taxRate = TAX_REFERENCE_RATE;
  let spendingScale = 1;
  let previousRatio: number | null = null;
  let spiralYears = 0;
  const rows: FiscalRow[] = [];
  const flows: FiscalYearFlow[] = [];
  const events: FiscalEvent[] = [];

  for (let year = start; year <= end; year++) {
    const macro = input.macroAt(year);
    const policyRate = centralBankPolicyRate(macro);
    const revenue = revenueShare * gdp * (taxRate / TAX_REFERENCE_RATE);
    const primarySpending = primarySpendingShare * gdp * spendingScale;
    // Net assets (negative debt) earn nothing in this fixture and pay no interest.
    const interest = Math.max(0, debt) * effectiveRate;
    const debtOpening = debt;
    const debtRatio = ratio(debt, gdp);

    rows.push({
      year,
      gdp,
      growth: macro.trendGrowth,
      inflation: macro.inflation,
      policyRate,
      debtRatio: debtRatio * 100,
      interestShareOfRevenue: ratio(interest, revenue) * 100,
      primaryBalance: ratio(revenue - primarySpending, gdp) * 100,
    });

    // Year close: finance the deficit, roll the maturing slice at the market rate.
    const deficit = primarySpending + interest - revenue;
    const maturing = Math.max(0, debt) / Math.max(1, policy.averageMaturityYears);
    const premium = Math.min(
      TERM_PREMIUM_MAX,
      TERM_PREMIUM_BASE + Math.max(0, debtRatio - 0.6) * TERM_PREMIUM_PER_DEBT_RATIO
    );
    const marketRate = (policyRate + premium) / 100;
    effectiveRate =
      debt > 0 ? (effectiveRate * (debt - maturing) + marketRate * maturing) / debt : marketRate;
    let closing = debt + deficit;
    let writtenOff = 0;

    spiralYears = nextInterestSpiralYears(spiralYears, {
      debtInterest: interest,
      revenueTotal: revenue,
    });
    if (shouldRestructureForInterest(spiralYears)) {
      const target = RESTRUCTURED_DEBT_RATIO * gdp;
      writtenOff = Math.max(0, closing - target);
      closing -= writtenOff;
      effectiveRate = marketRate;
      spiralYears = 0;
      events.push({ year, kind: "restructuring", detail: writtenOff });
    }

    flows.push({
      year,
      debtOpening,
      revenue,
      primarySpending,
      interest,
      deficit,
      refinanced: maturing,
      debtClosing: closing,
      writtenOff,
    });

    // The stabilizer reads this year's books, then next year starts on its package.
    const closeRatio = ratio(closing, gdp);
    const plan = planFiscalConsolidation({
      gdp,
      revenueTotal: revenue,
      spendingTotal: primarySpending + interest,
      debtInterest: interest,
      debtToGdpRatio: closeRatio,
      previousDebtToGdpRatio: previousRatio,
      debtThreshold: { gdpPenalty: closeRatio > DISTRESS_DEBT_RATIO ? 0.5 : 0 },
      rulingEconomicPosition: 0,
      spendingByCategory: { programmes: primarySpending, defense: 0 },
      categoryScale: { programmes: spendingScale },
      taxLines: [{ revenue, rates: { incomeTax: taxRate } }],
    });
    previousRatio = closeRatio;
    const primaryShare = ratio(revenue - primarySpending, gdp);
    if (!plan && primaryShare > SURPLUS_SPEND_FLOOR && primarySpending > 0) {
      // Fixture assumption mirroring the deficit rule: a third of a surplus
      // above the floor is spent each year.
      const give = ((primaryShare - SURPLUS_SPEND_FLOOR) / 3) * gdp;
      spendingScale *= 1 + give / primarySpending;
      events.push({ year, kind: "surplus-spend", detail: give / gdp });
    }
    if (plan) {
      taxRate = plan.taxRateTargets.incomeTax ?? taxRate;
      spendingScale = plan.categoryScale.programmes ?? spendingScale;
      events.push({ year, kind: "consolidation", detail: plan.sizeGdpShare });
    }

    gdp *= (1 + macro.trendGrowth / 100) * (1 + macro.inflation / 100);
    debt = closing;
  }
  return { rows, flows, events };
}

export function renderFiscalTable(countryId: string, run: FiscalRun): string {
  const lines = [
    `| ${countryId} year | GDP (bn) | growth % | inflation % | policy rate % | debt / GDP % | interest / revenue % |`,
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const r of run.rows) {
    if (!(FISCAL_CHECKPOINT_YEARS as readonly number[]).includes(r.year)) continue;
    lines.push(
      `| ${r.year === 2027 ? "opening" : r.year} | ${(r.gdp / 1e9).toFixed(0)} | ${r.growth.toFixed(2)} | ${r.inflation.toFixed(2)} | ${r.policyRate.toFixed(2)} | ${r.debtRatio.toFixed(1)} | ${r.interestShareOfRevenue.toFixed(1)} |`
    );
  }
  return lines.join("\n");
}
