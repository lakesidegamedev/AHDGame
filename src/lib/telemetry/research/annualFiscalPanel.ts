import { type LongHorizonSourceClass } from "@/lib/telemetry/longHorizon/rules";

export const ANNUAL_FISCAL_CALC_VERSION = 1;

/** Run-level provenance shared by every research row. */
export interface ResearchProvenance {
  worldId: string;
  sourceClass: LongHorizonSourceClass;
  runId?: string;
  seed?: string;
  codeVersion?: string;
  turn: number;
  year: number;
  foundingTurn: boolean;
  /** Actual UTC time the row was observed (written at the end of the turn). */
  observedAt: Date;
  schemaVersion: number;
  calcVersion: number;
  retentionPolicy: string;
  retentionVersion: number;
}

export function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 && Number.isFinite(numerator) ? numerator / denominator : null;
}

export function round(value: number, places = 4): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

// ── Country-turn macro, monetary and fiscal panel ─────────────

/**
 * Who set the policy rate. `government`: the head of government or finance
 * seat (pre-independence regimes). `committee`: a seated FOMC-style board.
 * `chair`: a single player chair. `autonomous-chair`: no player holds the
 * chair, so the autonomous technocrat rule sets the rate.
 */
export type PolicyAuthority = "government" | "committee" | "chair" | "autonomous-chair";

export type RateDecision = "hike" | "cut" | "hold";

/** Denominator source of the reported debt/GDP ratio (see `sovereignDebtTerms`). */
export type DebtRatioDenominator = "gdpSmoothed" | "gdp";

export interface CountryTurnMacro {
  /** Annual %, from `federalBudget.economicFactors.inflationRate`. */
  inflationRate: number | null;
  /** Annual %, era-aware target the autonomous chair steers toward. */
  targetInflation: number | null;
  /** Annual %, spot policy rate. */
  primeRate: number | null;
  /** Annual %, EMA of the prime rate: the lagged effective rate equities price off. */
  effectiveRate: number | null;
  /** Annual %, national GDP growth as snapshotted for the central bank. */
  gdpGrowth: number | null;
  /** GDP-weighted mean of regional output gaps (%). */
  outputGap: number | null;
  /** Population-weighted mean of regional unemployment rates (%). */
  unemploymentRate: number | null;
  /** Annual %, from the federal budget economic factors. */
  wageGrowth: number | null;
  /** Annual %, from the federal budget economic factors. */
  tradeGrowth: number | null;
  /** Local currency, national GDP level (sum of regions x 1M). */
  gdp: number | null;
}

export interface CountryTurnMonetary {
  authority: PolicyAuthority | null;
  decision: RateDecision | null;
  /** Policy-rate change executed this turn (pp); 0 on a hold. */
  rateChange: number | null;
  /** Whether the executed change came from a player or the system rule. */
  rateChangeActor: "player" | "system" | null;
  lastRateChangeTurn: number | null;
  /** Latest autonomous monetary-operation decision when evaluated this turn. */
  operationDecision: string | null;
  fxRegime: string | null;
  monetaryRegime: string | null;
  capitalControls: boolean | null;
  /** Local currency units per anchor unit. */
  exchangeRate: number | null;
}

export interface CountryTurnFiscal {
  fiscalYear: number | null;
  /** Annual budget figures, local currency. Recomputed at fiscal close and on tax changes. */
  revenueTotal: number | null;
  revenueBySource: Record<string, number>;
  spendingTotal: number | null;
  spendingByCategory: Record<string, number>;
  stateGrants: number | null;
  debtInterest: number | null;
  /** surplus + debtInterest: the balance before interest. */
  primaryBalance: number | null;
  surplus: number | null;
  treasuryBalance: number | null;
  /** Closing sovereign principal: outstanding bond stock at end of turn. */
  debtPrincipal: number | null;
  debtInterestRate: number | null;
  debtToGdpRatio: number | null;
  debtToGdpDenominator: DebtRatioDenominator | null;
  debtToGdpDenominatorValue: number | null;
  creditRating: string | null;
  /** Sovereign face issued, redeemed and repudiated this turn (bond ledger). */
  sovereignIssuedFace: number;
  sovereignRetiredFace: number;
  sovereignDefaultedFace: number;
  /** Coupon due this turn on outstanding non-defaulted sovereign face. */
  sovereignScheduledCoupon: number;
}

export interface CountryTurnRow extends ResearchProvenance {
  country: string;
  currencyCode: string | null;
  macro: CountryTurnMacro;
  monetary: CountryTurnMonetary;
  fiscal: CountryTurnFiscal;
  events: { atWar: boolean; conflictIds: string[] };
  /** Dotted paths of every field that was unavailable this turn. */
  missing: string[];
}

// ── Annual fiscal and debt decomposition ─────────────────────────────

export interface AnnualFiscalRow {
  country: string;
  fiscalYear: number;
  firstTurn: number;
  lastTurn: number;
  firstObservedAt: Date;
  lastObservedAt: Date;
  retainedTurns: number;
  /** Expected turns between first and last retained turn that have no row. */
  missingTurns: number[];
  currencyCode: string | null;
  /** Closing principal of the prior retained turn, or derived for the first year. */
  openingDebt: number | null;
  openingDebtSource: "prior-turn-close" | "derived-from-first-turn-flows" | null;
  closingDebt: number | null;
  issued: number;
  retired: number;
  defaulted: number;
  scheduledCoupons: number;
  /**
   * closing - (opening + issued - retired - defaulted). Restructure haircuts
   * and merger/secession transfers are not stamped per turn by the bond
   * ledger, so they surface here instead of being hidden.
   */
  reconciliationResidual: number | null;
  /** Budget-basis annual figures at the fiscal-year close (last retained turn). */
  revenueTotal: number | null;
  revenueBySource: Record<string, number>;
  spendingTotal: number | null;
  spendingByCategory: Record<string, number>;
  debtInterest: number | null;
  surplus: number | null;
  primaryBalance: number | null;
  openingTreasury: number | null;
  closingTreasury: number | null;
  treasuryChange: number | null;
  gdp: number | null;
  debtToGdpRatio: number | null;
  debtToGdpDenominator: DebtRatioDenominator | null;
  debtToGdpDenominatorValue: number | null;
  /** closingDebt / denominator: reproduces the reported ratio from exported fields. */
  debtToGdpReproduced: number | null;
  /** Nominal GDP growth over the prior fiscal year's closing GDP. */
  nominalGdpGrowth: number | null;
  /** debtInterest / mean(opening, closing) debt. */
  effectiveInterestRate: number | null;
  /** effectiveInterestRate - nominalGdpGrowth (r - g). */
  interestGrowthDifferential: number | null;
  warTurns: number;
  conflictIds: string[];
  creditRating: string | null;
  calcVersion: number;
}

/**
 * Collapse country-turn rows into one row per country and fiscal year. Rows
 * may arrive in any order; each country is processed oldest turn first. The
 * flow totals are exact sums over retained turns; a gap in retained turns is
 * listed in `missingTurns`, and the residual then also absorbs the flows of
 * the missing turns rather than pretending they were zero.
 */
export function buildAnnualFiscalPanel(rows: readonly CountryTurnRow[]): AnnualFiscalRow[] {
  const byCountry = new Map<string, CountryTurnRow[]>();
  for (const row of rows) {
    if (row.fiscal.fiscalYear === null) continue;
    const list = byCountry.get(row.country) ?? [];
    list.push(row);
    byCountry.set(row.country, list);
  }

  const out: AnnualFiscalRow[] = [];
  for (const [country, list] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort((a, b) => a.turn - b.turn);
    const years: CountryTurnRow[][] = [];
    for (const row of list) {
      const current = years[years.length - 1];
      if (current && current[0].fiscal.fiscalYear === row.fiscal.fiscalYear) current.push(row);
      else years.push([row]);
    }

    let priorClose: CountryTurnRow | null = null;
    let priorAnnual: AnnualFiscalRow | null = null;
    for (const turns of years) {
      const first = turns[0];
      const last = turns[turns.length - 1];
      const sum = (pick: (r: CountryTurnRow) => number) => turns.reduce((t, r) => t + pick(r), 0);
      const issued = sum((r) => r.fiscal.sovereignIssuedFace);
      const retired = sum((r) => r.fiscal.sovereignRetiredFace);
      const defaulted = sum((r) => r.fiscal.sovereignDefaultedFace);

      let openingDebt: number | null = null;
      let openingDebtSource: AnnualFiscalRow["openingDebtSource"] = null;
      if (priorClose && priorClose.fiscal.debtPrincipal !== null) {
        openingDebt = priorClose.fiscal.debtPrincipal;
        openingDebtSource = "prior-turn-close";
      } else if (first.fiscal.debtPrincipal !== null) {
        openingDebt =
          first.fiscal.debtPrincipal -
          first.fiscal.sovereignIssuedFace +
          first.fiscal.sovereignRetiredFace +
          first.fiscal.sovereignDefaultedFace;
        openingDebtSource = "derived-from-first-turn-flows";
      }
      const closingDebt = last.fiscal.debtPrincipal;
      const residual =
        openingDebt !== null && closingDebt !== null
          ? round(closingDebt - (openingDebt + issued - retired - defaulted), 2)
          : null;

      const missingTurns: number[] = [];
      const present = new Set(turns.map((r) => r.turn));
      const startTurn = priorClose ? priorClose.turn + 1 : first.turn;
      for (let t = startTurn; t <= last.turn; t++) if (!present.has(t)) missingTurns.push(t);

      const gdp = last.macro.gdp;
      const nominalGdpGrowth =
        priorAnnual?.gdp && gdp !== null
          ? ratioOrNull(gdp - priorAnnual.gdp, priorAnnual.gdp)
          : null;
      const meanDebt =
        openingDebt !== null && closingDebt !== null ? (openingDebt + closingDebt) / 2 : null;
      const effectiveInterestRate =
        last.fiscal.debtInterest !== null && meanDebt !== null
          ? ratioOrNull(last.fiscal.debtInterest, meanDebt)
          : null;
      const conflictIds = [...new Set(turns.flatMap((r) => r.events.conflictIds))].sort();
      const openingTreasury = priorClose?.fiscal.treasuryBalance ?? first.fiscal.treasuryBalance;
      const closingTreasury = last.fiscal.treasuryBalance;

      const annual: AnnualFiscalRow = {
        country,
        fiscalYear: first.fiscal.fiscalYear as number,
        firstTurn: first.turn,
        lastTurn: last.turn,
        firstObservedAt: first.observedAt,
        lastObservedAt: last.observedAt,
        retainedTurns: turns.length,
        missingTurns,
        currencyCode: last.currencyCode,
        openingDebt,
        openingDebtSource,
        closingDebt,
        issued: round(issued, 2),
        retired: round(retired, 2),
        defaulted: round(defaulted, 2),
        scheduledCoupons: round(
          sum((r) => r.fiscal.sovereignScheduledCoupon),
          2
        ),
        reconciliationResidual: residual,
        revenueTotal: last.fiscal.revenueTotal,
        revenueBySource: last.fiscal.revenueBySource,
        spendingTotal: last.fiscal.spendingTotal,
        spendingByCategory: last.fiscal.spendingByCategory,
        debtInterest: last.fiscal.debtInterest,
        surplus: last.fiscal.surplus,
        primaryBalance: last.fiscal.primaryBalance,
        openingTreasury,
        closingTreasury,
        treasuryChange:
          openingTreasury !== null && closingTreasury !== null
            ? closingTreasury - openingTreasury
            : null,
        gdp,
        debtToGdpRatio: last.fiscal.debtToGdpRatio,
        debtToGdpDenominator: last.fiscal.debtToGdpDenominator,
        debtToGdpDenominatorValue: last.fiscal.debtToGdpDenominatorValue,
        debtToGdpReproduced:
          closingDebt !== null && last.fiscal.debtToGdpDenominatorValue !== null
            ? ratioOrNull(closingDebt, last.fiscal.debtToGdpDenominatorValue)
            : null,
        nominalGdpGrowth,
        effectiveInterestRate,
        interestGrowthDifferential:
          effectiveInterestRate !== null && nominalGdpGrowth !== null
            ? effectiveInterestRate - nominalGdpGrowth
            : null,
        warTurns: turns.filter((r) => r.events.atWar).length,
        conflictIds,
        creditRating: last.fiscal.creditRating,
        calcVersion: ANNUAL_FISCAL_CALC_VERSION,
      };
      out.push(annual);
      priorClose = last;
      priorAnnual = annual;
    }
  }
  return out;
}
