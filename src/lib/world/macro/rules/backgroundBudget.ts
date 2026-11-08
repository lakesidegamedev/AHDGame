/**
 * National budget for a background country, derived from its macro economy.
 *
 * Background countries have no simulated regions or enacted laws, so the
 * budget is three numbers:
 * - GDP: seeded national GDP, moved with aggregate output and price level;
 * - revenue: GDP x fiscal capacity x cumulative stabilizer tax rises;
 * - spending: programmes (share of GDP, scaled by cumulative cuts) plus
 *   interest the sovereign bond stock actually carries.
 *
 * At fiscal-year close the shared stabilizer plans a consolidation package
 * when the primary deficit is out of hand, split by governing parties'
 * economic position, and the politics model pays its approval cost.
 * Programme spending drifts toward the government's stance. Debt interest
 * above half of revenue for two years restructures through the sovereign
 * default path.
 *
 * Pure: plain data in, plain data out.
 */
import {
  nextInterestSpiralYears,
  planFiscalConsolidation,
  shouldRestructureForInterest,
  type FiscalConsolidationPackage,
} from "@/lib/budget/rules/fiscalStabilizer";
import type { MacroSectorState } from "../types";

/** The single programme line on a background budget. */
export const PROGRAMME_CATEGORY = "programmes";
/** The single tax line, a rate in percent of GDP. */
export const TAX_TAKE_KEY = "taxTake";
/** Share of the gap to the government's spending stance closed each fiscal year. */
export const STANCE_ADJUSTMENT = 0.25;
/** Programme share of GDP a far-left (+) or far-right (-) government moves toward, relative. */
export const STANCE_SPENDING_RANGE = 0.05;

export interface BackgroundFiscalPackageRecord {
  fiscalYear: number;
  turn: number;
  sizeGdpShare: number;
  taxRise: number;
  spendingCut: number;
  unfunded: number;
  approvalCost: number;
}

export interface BackgroundFiscalState {
  /** Output and GDP (local currency) when the model first read the budget. */
  baseline: { output: number; gdpLocal: number };
  /** Price level since the baseline (1 = baseline prices). */
  priceLevel: number;
  /** Programme spending as a share of GDP before cuts. */
  programmeShare: number;
  /** The programme share the opening budget ran: the stance is measured from it. */
  baseProgrammeShare: number;
  /** Cumulative stabilizer cut (1 = none). */
  programmeScale: number;
  /** Cumulative stabilizer tax rise (1 = none). */
  taxScale: number;
  interestSpiralYears: number;
  /** Debt/GDP at the last fiscal close, for the stabilizer's trend test. */
  lastDebtToGdpRatio: number | null;
  lastPackage: BackgroundFiscalPackageRecord | null;
}

const finite = (value: number | null | undefined, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

/** The stability and shock multiplier market production applies to capacity output. */
export function realizedOutputFactor(stability: number, shockModifier: number): number {
  const shock = Number.isFinite(shockModifier) && shockModifier > 0 ? shockModifier : 1;
  return clamp(finite(stability, 1), 0, 1) * shock;
}

/** Aggregate output: capacity times productivity over every sector, times the realized factor. */
export function macroAggregateOutput(
  sectors: Partial<Record<string, Pick<MacroSectorState, "capacity" | "productivity">>> | undefined,
  factor = 1
): number {
  let total = 0;
  for (const sector of Object.values(sectors ?? {})) {
    if (!sector) continue;
    const value = finite(sector.capacity) * finite(sector.productivity, 1);
    if (value > 0) total += value;
  }
  return total * Math.max(0, finite(factor, 1));
}

/** The opening fiscal state: programmes sized so the first budget runs the authored primary balance. */
export function initialBackgroundFiscal(input: {
  output: number;
  gdpLocal: number;
  fiscalCapacity: number;
  initialPrimaryBalance: number;
}): BackgroundFiscalState {
  const programmeShare = clamp(
    finite(input.fiscalCapacity) - finite(input.initialPrimaryBalance),
    0.05,
    0.8
  );
  return {
    baseline: {
      output: Math.max(0, finite(input.output)),
      gdpLocal: Math.max(0, finite(input.gdpLocal)),
    },
    priceLevel: 1,
    programmeShare,
    baseProgrammeShare: programmeShare,
    programmeScale: 1,
    taxScale: 1,
    interestSpiralYears: 0,
    lastDebtToGdpRatio: null,
    lastPackage: null,
  };
}

/** Advance the price level by annual inflation (percent) over the turns elapsed. */
export function advancePriceLevel(
  priceLevel: number,
  inflationPercent: number,
  turnsElapsed: number,
  turnsPerYear: number
): number {
  if (!(turnsElapsed > 0) || !(turnsPerYear > 0)) return priceLevel;
  const rate = clamp(finite(inflationPercent, 2) / 100, -0.1, 1);
  return finite(priceLevel, 1) * (1 + rate) ** (turnsElapsed / turnsPerYear);
}

/** Annual GDP in local currency from aggregate output. Null when the baseline is unusable. */
export function backgroundAnnualGdp(fiscal: BackgroundFiscalState, output: number): number | null {
  const { baseline } = fiscal;
  if (!(baseline.output > 0) || !(baseline.gdpLocal > 0) || !(output > 0)) return null;
  return baseline.gdpLocal * (output / baseline.output) * finite(fiscal.priceLevel, 1);
}

/** Current tax take, percent of GDP. */
export function backgroundTaxTakePercent(
  fiscal: BackgroundFiscalState,
  fiscalCapacity: number
): number {
  return finite(fiscalCapacity) * finite(fiscal.taxScale, 1) * 100;
}

export interface BackgroundBudgetFigures {
  gdp: number;
  revenueTotal: number;
  programmes: number;
  debtInterest: number;
  spendingTotal: number;
}

/** One year's revenue and spending at the current GDP. */
export function backgroundBudgetFigures(input: {
  gdp: number;
  fiscalCapacity: number;
  fiscal: BackgroundFiscalState;
  debtInterest: number;
}): BackgroundBudgetFigures {
  const gdp = Math.max(0, finite(input.gdp));
  const revenueTotal = (gdp * backgroundTaxTakePercent(input.fiscal, input.fiscalCapacity)) / 100;
  const programmes =
    gdp * finite(input.fiscal.programmeShare) * clamp(finite(input.fiscal.programmeScale, 1), 0, 1);
  const debtInterest = Math.max(0, finite(input.debtInterest));
  return {
    gdp,
    revenueTotal,
    programmes,
    debtInterest,
    spendingTotal: programmes + debtInterest,
  };
}

/**
 * Fiscal-year close: drift programmes toward the government's stance, then
 * run the shared stabilizer on the derived budget. Returns the new state, the
 * package (if any) and whether the interest spiral now forces a restructuring.
 */
export function closeBackgroundFiscalYear(input: {
  fiscal: BackgroundFiscalState;
  gdp: number;
  fiscalCapacity: number;
  debtInterest: number;
  debtToGdpRatio: number;
  debtThreshold: { gdpPenalty: number };
  /** Governing parties' economic position on the party grid (-5..+5), or null. */
  governmentEconomicPosition: number | null;
  fiscalYear: number;
  turn: number;
  consolidate: boolean;
}): {
  fiscal: BackgroundFiscalState;
  package: FiscalConsolidationPackage | null;
  restructure: boolean;
} {
  const position =
    input.governmentEconomicPosition === null
      ? null
      : clamp(finite(input.governmentEconomicPosition) / 5, -1, 1);

  // Stance: a left government (negative position) spends more, a right one less.
  const stanceTarget =
    input.fiscal.baseProgrammeShare * (1 - STANCE_SPENDING_RANGE * (position ?? 0));
  const programmeShare =
    input.fiscal.programmeShare + STANCE_ADJUSTMENT * (stanceTarget - input.fiscal.programmeShare);
  let fiscal: BackgroundFiscalState = { ...input.fiscal, programmeShare };

  const figures = backgroundBudgetFigures({
    gdp: input.gdp,
    fiscalCapacity: input.fiscalCapacity,
    fiscal,
    debtInterest: input.debtInterest,
  });
  const interestSpiralYears = nextInterestSpiralYears(fiscal.interestSpiralYears, {
    debtInterest: figures.debtInterest,
    revenueTotal: figures.revenueTotal,
  });

  let pkg: FiscalConsolidationPackage | null = null;
  if (input.consolidate) {
    const taxTake = backgroundTaxTakePercent(fiscal, input.fiscalCapacity);
    pkg = planFiscalConsolidation({
      gdp: figures.gdp,
      revenueTotal: figures.revenueTotal,
      spendingTotal: figures.spendingTotal,
      debtInterest: figures.debtInterest,
      debtToGdpRatio: input.debtToGdpRatio,
      previousDebtToGdpRatio: fiscal.lastDebtToGdpRatio,
      debtThreshold: input.debtThreshold,
      rulingEconomicPosition: position,
      spendingByCategory: { [PROGRAMME_CATEGORY]: figures.programmes },
      categoryScale: { [PROGRAMME_CATEGORY]: fiscal.programmeScale },
      taxLines: [{ revenue: figures.revenueTotal, rates: { [TAX_TAKE_KEY]: taxTake } }],
    });
  }
  if (pkg) {
    const nextScale = pkg.categoryScale[PROGRAMME_CATEGORY];
    const nextTaxTake = pkg.taxRateTargets[TAX_TAKE_KEY];
    fiscal = {
      ...fiscal,
      programmeScale: typeof nextScale === "number" ? nextScale : fiscal.programmeScale,
      taxScale:
        typeof nextTaxTake === "number" && input.fiscalCapacity > 0
          ? nextTaxTake / (input.fiscalCapacity * 100)
          : fiscal.taxScale,
      lastPackage: {
        fiscalYear: input.fiscalYear,
        turn: input.turn,
        sizeGdpShare: pkg.sizeGdpShare,
        taxRise: pkg.taxRise,
        spendingCut: pkg.spendingCut,
        unfunded: pkg.unfunded,
        approvalCost: pkg.approvalCost,
      },
    };
  }
  // A restructuring resets the count, as it does for full countries.
  const restructure = shouldRestructureForInterest(interestSpiralYears);
  fiscal = {
    ...fiscal,
    interestSpiralYears: restructure ? 0 : interestSpiralYears,
    lastDebtToGdpRatio: finite(input.debtToGdpRatio, 0),
  };
  return { fiscal, package: pkg, restructure };
}
