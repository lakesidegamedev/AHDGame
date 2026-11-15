/**
 * Fiscal stabilizer: the consolidation package an AI-run government enacts at
 * fiscal-year close when its primary deficit is out of hand.
 *
 * Bill sponsorship alone cannot close a double-digit primary deficit, so this
 * rule sizes a package directly:
 *
 * - Trigger: the primary balance is below the floor. The floor is -3% of GDP,
 *   tightening to balance (0%) while debt/GDP sits above the country's debt
 *   threshold (a rating band carrying a growth penalty) and is still rising.
 * - Size: one third of the gap between the primary balance and that floor, but
 *   never less than 2% of GDP (or the whole gap when smaller). A third alone
 *   only halves the gap geometrically; the minimum step closes it in five years.
 * - Split: tax rises versus category spending cuts by the ruling party's
 *   economic position. Left leans taxes, right leans cuts, centre splits evenly.
 * - Limits: no category cut more than 15% in one year or below half its
 *   law-priced level; defence and debt interest never cut; a tax rate rises at
 *   most three points a year and never above 60%. What one side cannot absorb
 *   moves to the other; anything left is reported as unfunded.
 *
 * When debt interest takes more than half of revenue for two fiscal years in a
 * row, the country restructures through the sovereign-default path instead.
 *
 * Pure: plain data in, plain data out. Revenue is scored statically.
 */

/** Primary deficit tolerated in ordinary times, as a share of GDP. */
export const PRIMARY_DEFICIT_FLOOR = -0.03;
/** Share of the gap above the floor closed by one year's package. */
export const PACKAGE_GAP_SHARE = 1 / 3;
/** Smallest package worth enacting, as a share of GDP (capped at the gap itself). */
export const MIN_PACKAGE_GDP_SHARE = 0.02;
/** Largest single-year cut to any one spending category. */
export const MAX_CATEGORY_CUT_PER_YEAR = 0.15;
/** A category is never cut below this fraction of its law-priced level. */
export const MIN_CATEGORY_SCALE = 0.5;
/** Largest single-year rise in any one tax rate, in percentage points. */
export const MAX_TAX_RATE_RISE_POINTS = 3;
/** Ceiling on any tax rate the stabilizer raises, in percent. */
export const TAX_RATE_CEILING = 60;
/** Approval points lost per 1% of GDP of consolidation. */
export const APPROVAL_COST_PER_GDP_POINT = 0.75;
/** Largest approval cost one package can carry. */
export const MAX_APPROVAL_COST = 4;
/** Debt interest above this share of revenue counts as an interest-spiral year. */
export const INTEREST_REVENUE_RESTRUCTURE_SHARE = 0.5;
/** Consecutive interest-spiral fiscal years that force a restructuring. */
export const INTEREST_SPIRAL_YEARS_FOR_RESTRUCTURE = 2;

/** Categories the stabilizer never cuts. */
export const DEFENCE_CATEGORIES: readonly string[] = ["defense", "defence", "military"];

/** One revenue line whose rates rise together, e.g. the three income tax tiers. */
export interface StabilizerTaxLine {
  /** Annual revenue the line currently raises. */
  revenue: number;
  /** Rate keys on the budget (percent) and the rate each currently stands at. */
  rates: Record<string, number>;
}

export interface FiscalStabilizerInput {
  gdp: number;
  revenueTotal: number;
  /** Total spending including debt interest. */
  spendingTotal: number;
  debtInterest: number;
  debtToGdpRatio: number;
  /** Debt/GDP at the previous fiscal close, or null when unknown. */
  previousDebtToGdpRatio: number | null;
  /** The country's band from `getDebtThreshold`; a growth penalty marks distress. */
  debtThreshold: { gdpPenalty: number };
  /**
   * Ruling party's economic position scaled to [-1, 1] (negative = left), or
   * null when there is no governing party, which reads as the centre.
   */
  rulingEconomicPosition: number | null;
  /** This year's spending by category, before the package. */
  spendingByCategory: Record<string, number>;
  /** Cumulative multiplier the stabilizer already applies per category (absent = 1). */
  categoryScale?: Record<string, number>;
  /** Extra categories that are obligations rather than discretionary programmes. */
  protectedCategories?: readonly string[];
  taxLines: StabilizerTaxLine[];
}

export interface FiscalConsolidationPackage {
  primaryBalanceGdpShare: number;
  targetPrimaryBalanceGdpShare: number;
  /** Planned package, local currency per year. */
  size: number;
  sizeGdpShare: number;
  /** Fraction of the package the ruling party wanted from taxes. */
  plannedTaxShare: number;
  taxRise: number;
  spendingCut: number;
  /** Part of the planned package the caps left unfunded. */
  unfunded: number;
  /** Fraction cut this year, per category. */
  categoryCuts: Record<string, number>;
  /** New cumulative scale per category after this year's cuts. */
  categoryScale: Record<string, number>;
  /** New target rate per rate key (percent). */
  taxRateTargets: Record<string, number>;
  /** Approval points the package costs the government (positive number). */
  approvalCost: number;
}

function finite(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Primary balance (revenue minus non-interest spending) as a share of GDP. */
export function primaryBalanceGdpShare(input: {
  gdp: number;
  revenueTotal: number;
  spendingTotal: number;
  debtInterest: number;
}): number | null {
  if (!(input.gdp > 0) || !Number.isFinite(input.gdp)) return null;
  const primarySpending = finite(input.spendingTotal) - Math.max(0, finite(input.debtInterest));
  return (finite(input.revenueTotal) - primarySpending) / input.gdp;
}

/** Fraction of a package the ruling party takes from taxes: 0.75 far left, 0.5 centre, 0.25 far right. */
export function plannedTaxShare(rulingEconomicPosition: number | null): number {
  const position = clamp(finite(rulingEconomicPosition), -1, 1);
  return 0.5 - 0.25 * position;
}

/**
 * Spread `target` over items in proportion to their weight, each capped at
 * `cap[i] * weight[i]`. Returns the fraction of its weight each item gives.
 */
function waterFill(weights: number[], caps: number[], target: number): number[] {
  const fractions = weights.map(() => 0);
  let remaining = target;
  const open = new Set(weights.map((_, i) => i).filter((i) => weights[i] > 0 && caps[i] > 0));
  while (remaining > 1e-9 && open.size > 0) {
    const openWeight = [...open].reduce((sum, i) => sum + weights[i], 0);
    const uniform = remaining / openWeight;
    const binding = [...open].filter((i) => caps[i] - fractions[i] <= uniform);
    if (binding.length === 0) {
      for (const i of open) fractions[i] += uniform;
      remaining = 0;
      break;
    }
    for (const i of binding) {
      remaining -= (caps[i] - fractions[i]) * weights[i];
      fractions[i] = caps[i];
      open.delete(i);
    }
  }
  return fractions;
}

/** Largest fractional rise a tax line can take this year under the per-rate caps. */
function taxLineHeadroom(line: StabilizerTaxLine): number {
  let headroom = Infinity;
  let hasRate = false;
  for (const rate of Object.values(line.rates)) {
    const r = finite(rate);
    if (r <= 0) continue;
    hasRate = true;
    const ceiling = Math.min(r + MAX_TAX_RATE_RISE_POINTS, TAX_RATE_CEILING);
    headroom = Math.min(headroom, Math.max(0, ceiling / r - 1));
  }
  return hasRate ? headroom : 0;
}

/**
 * The consolidation package for the coming fiscal year, or null when the
 * primary balance already meets the floor (or the inputs are unusable).
 */
export function planFiscalConsolidation(
  input: FiscalStabilizerInput
): FiscalConsolidationPackage | null {
  const balance = primaryBalanceGdpShare(input);
  if (balance === null) return null;

  const distressed =
    finite(input.debtThreshold.gdpPenalty) > 0 &&
    input.previousDebtToGdpRatio !== null &&
    finite(input.debtToGdpRatio) > finite(input.previousDebtToGdpRatio);
  const floor = distressed ? 0 : PRIMARY_DEFICIT_FLOOR;
  const gapShare = floor - balance;
  if (!(gapShare > 0)) return null;

  const sizeGdpShare = Math.min(
    gapShare,
    Math.max(gapShare * PACKAGE_GAP_SHARE, MIN_PACKAGE_GDP_SHARE)
  );
  const size = sizeGdpShare * input.gdp;
  const taxShare = plannedTaxShare(input.rulingEconomicPosition);

  // Spending side: eligible categories and how far each may still fall.
  const protectedSet = new Set([...DEFENCE_CATEGORIES, ...(input.protectedCategories ?? [])]);
  const scaleIn = input.categoryScale ?? {};
  const categories = Object.entries(input.spendingByCategory).filter(
    ([key, amount]) => !protectedSet.has(key) && finite(amount) > 0
  );
  const cutWeights = categories.map(([, amount]) => amount);
  const cutCaps = categories.map(([key]) => {
    const scale = clamp(finite(scaleIn[key], 1), 0, 1);
    const toFloor = scale > MIN_CATEGORY_SCALE ? 1 - MIN_CATEGORY_SCALE / scale : 0;
    return Math.min(MAX_CATEGORY_CUT_PER_YEAR, toFloor);
  });
  const cutCapacity = cutWeights.reduce((sum, w, i) => sum + w * cutCaps[i], 0);

  // Tax side: lines that raise revenue and still have rate headroom.
  const taxWeights = input.taxLines.map((line) => Math.max(0, finite(line.revenue)));
  const taxCaps = input.taxLines.map(taxLineHeadroom);
  const taxCapacity = taxWeights.reduce((sum, w, i) => sum + w * taxCaps[i], 0);

  // Each side takes its planned share; what one cannot absorb moves to the other.
  let tax = Math.min(size * taxShare, taxCapacity);
  let cut = Math.min(size - size * taxShare, cutCapacity);
  let short = size - tax - cut;
  const extraCut = Math.min(short, cutCapacity - cut);
  cut += extraCut;
  short -= extraCut;
  const extraTax = Math.min(short, taxCapacity - tax);
  tax += extraTax;
  short -= extraTax;

  const cutFractions = waterFill(cutWeights, cutCaps, cut);
  const categoryCuts: Record<string, number> = {};
  const categoryScale: Record<string, number> = { ...scaleIn };
  categories.forEach(([key], i) => {
    if (cutFractions[i] <= 0) return;
    categoryCuts[key] = cutFractions[i];
    categoryScale[key] = clamp(finite(scaleIn[key], 1), 0, 1) * (1 - cutFractions[i]);
  });

  const riseFractions = waterFill(taxWeights, taxCaps, tax);
  const taxRateTargets: Record<string, number> = {};
  input.taxLines.forEach((line, i) => {
    if (riseFractions[i] <= 0) return;
    for (const [key, rate] of Object.entries(line.rates)) {
      const r = finite(rate);
      if (r <= 0) continue;
      taxRateTargets[key] = Math.round(r * (1 + riseFractions[i]) * 100) / 100;
    }
  });

  return {
    primaryBalanceGdpShare: balance,
    targetPrimaryBalanceGdpShare: floor,
    size,
    sizeGdpShare,
    plannedTaxShare: taxShare,
    taxRise: tax,
    spendingCut: cut,
    unfunded: Math.max(0, short),
    categoryCuts,
    categoryScale,
    taxRateTargets,
    approvalCost: fiscalConsolidationApprovalCost(((tax + cut) / input.gdp) * 100),
  };
}

/** Approval points a package of `gdpPoints` percent of GDP costs, capped. */
export function fiscalConsolidationApprovalCost(gdpPoints: number): number {
  if (!(gdpPoints > 0)) return 0;
  return Math.round(Math.min(MAX_APPROVAL_COST, gdpPoints * APPROVAL_COST_PER_GDP_POINT) * 10) / 10;
}

/**
 * Approval effect of a package `turnsSince` turns after it was enacted: the
 * full cost on enactment, fading linearly to nothing over `fadeTurns`.
 */
export function fiscalConsolidationApprovalEffect(
  approvalCost: number,
  turnsSince: number,
  fadeTurns: number
): number {
  if (!(approvalCost > 0) || !(fadeTurns > 0) || turnsSince < 0 || turnsSince >= fadeTurns)
    return 0;
  return -Math.round(approvalCost * (1 - turnsSince / fadeTurns) * 10) / 10;
}

export interface ConsolidationPackageInput {
  fiscalYear: number;
  appliedTurn: number;
  sizeGdpShare: number;
  taxRise: number;
  spendingCut: number;
  approvalCost: number;
}

/** What a country page shows of its latest consolidation package. */
export interface FiscalConsolidationSummary {
  fiscalYear: number;
  /** Package size as a share of GDP. */
  sizeGdpShare: number;
  /** Shares of the package raised by taxes and made up of spending cuts; they sum to 1. */
  taxShare: number;
  cutShare: number;
  /** Approval points the package cost on enactment, and what is still being felt. */
  approvalCost: number;
  approvalEffectNow: number;
  /** Turns until the approval effect has faded away. */
  turnsRemaining: number;
}

/**
 * The package to show on the country page: the latest one, while its approval
 * cost is still fading (one year). Null once it has faded or when none exists.
 */
export function summariseFiscalConsolidation(
  record: ConsolidationPackageInput | null | undefined,
  turn: number,
  fadeTurns: number
): FiscalConsolidationSummary | null {
  if (!record) return null;
  const turnsSince = turn - record.appliedTurn;
  if (!(fadeTurns > 0) || turnsSince < 0 || turnsSince >= fadeTurns) return null;
  const total = record.taxRise + record.spendingCut;
  const taxShare = total > 0 ? record.taxRise / total : 0;
  return {
    fiscalYear: record.fiscalYear,
    sizeGdpShare: record.sizeGdpShare,
    taxShare,
    cutShare: total > 0 ? 1 - taxShare : 0,
    approvalCost: record.approvalCost,
    approvalEffectNow: -fiscalConsolidationApprovalEffect(
      record.approvalCost,
      turnsSince,
      fadeTurns
    ),
    turnsRemaining: fadeTurns - turnsSince,
  };
}

/** Apply cumulative category scales to a spending breakdown (absent key = unscaled). */
export function applyCategoryScale(
  byCategory: Record<string, number>,
  categoryScale: Record<string, number> | undefined
): Record<string, number> {
  if (!categoryScale) return byCategory;
  const out: Record<string, number> = {};
  for (const [key, amount] of Object.entries(byCategory)) {
    const scale = categoryScale[key];
    out[key] =
      typeof scale === "number" && Number.isFinite(scale) && amount > 0
        ? amount * clamp(scale, 0, 1)
        : amount;
  }
  return out;
}

/** Consecutive fiscal years in which debt interest took more than half of revenue. */
export function nextInterestSpiralYears(
  previousYears: number,
  input: { debtInterest: number; revenueTotal: number }
): number {
  const interest = Math.max(0, finite(input.debtInterest));
  const revenue = finite(input.revenueTotal);
  const spiral =
    interest > 0 && interest > INTEREST_REVENUE_RESTRUCTURE_SHARE * Math.max(0, revenue);
  return spiral ? Math.max(0, Math.floor(finite(previousYears))) + 1 : 0;
}

export function shouldRestructureForInterest(interestSpiralYears: number): boolean {
  return interestSpiralYears >= INTEREST_SPIRAL_YEARS_FOR_RESTRUCTURE;
}
