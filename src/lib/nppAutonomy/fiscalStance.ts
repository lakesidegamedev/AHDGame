/**
 * FiscalStance: the NPP government's tax-and-spend posture derived from the
 * governing agenda, macro position, and head's archetype. Biases sponsored
 * tax/spending bills (see selectNppBill's fiscal nudge). Pairs with the
 * central bank's hawk/dove chairAlignment to produce emergent fiscal-monetary
 * tension without either side knowing about the other.
 *
 * Pure + deterministic. The orchestrator persists the result; nothing here
 * touches the DB.
 */

import type { NPPPersonality } from "@/lib/db/types/npp";
import type { GoverningAgendaItem } from "./governingAgenda";
import { deriveGoverningArchetype, governingArchetypeModifiers } from "./governingArchetype";
import { internalRepressionFromReformism } from "@/lib/constants/commandEconomy";
import { getDebtThreshold } from "@/lib/budget/debt";
import { fiscalDeficitPressure } from "./rules/fiscalDeficitPressure";

export type FiscalStance = "expansionary" | "neutral" | "austere";

export interface PersistedFiscalStance {
  stance: FiscalStance;
  /**
   * Fiscal-domain effect direction the posture favors, matching the legislation
   * `effectDirection` convention used for fiscal bills: +1 = tighten (austere),
   * -1 = loosen / spend (expansionary), 0 = neutral.
   */
  direction: -1 | 0 | 1;
  /** Posture conviction in [0, 1] — scales the sponsorship score nudge. */
  intensity: number;
  /** Game turn the stance was computed. */
  computedTurn: number;
}

export interface FiscalStanceInputs {
  agenda: GoverningAgendaItem[];
  /** Inflation rate (%). */
  inflationRate: number;
  /**
   * This country's own central-bank target inflation rate (%), e.g. from
   * `getEraMonetaryBaseline`/`MONETARY_BASELINES`. Inflation is judged "hot"
   * relative to THIS, not a single global number - a regime whose own target
   * sits at 15% (Yugoslavia's dual-price economy) isn't in distress at 15%
   * inflation the way a 2%-target economy would be. Defaults to the modern
   * 2% anchor (`DEFAULT_TARGET_INFLATION`) when omitted, so existing callers
   * that don't pass it keep the old effective 4.0% hot line unchanged.
   */
  targetInflationRate?: number;
  /** Debt as a fraction of GDP (1.0 = 100% of GDP). */
  debtToGdpRatio: number;
  /** Annual revenue minus annual spending, divided by annual budget GDP. */
  fiscalBalanceGdpShare?: number;
  /** Head-of-government personality → archetype spend appetite. */
  personality: NPPPersonality;
  currentTurn: number;
}

/**
 * Fallback target inflation (%) when the caller doesn't supply the country's
 * own anchor. Matches `budget/inflation.ts`'s `BASE_TARGET` - the modern-era
 * default most countries actually run - so untouched call sites keep the old
 * INFLATION_HOT=4.0 behavior byte-for-byte (2.0 + INFLATION_HOT_MARGIN).
 */
const DEFAULT_TARGET_INFLATION = 2.0;
/**
 * Percentage points above the country's OWN target before inflation reads
 * "hot". A flat absolute (the old INFLATION_HOT=4.0) mis-fires two ways: it
 * never trips for a regime whose institutional target already exceeds 4%
 * (measured in the ahd_sim_g53v4 sandbox: YU's target is 15%, so inflation
 * sitting at its normal chronic level would still register as calm 1979-era
 * BR/TR/FR/GR - targets 4-10% - read "hot" simply for being at *target*, with
 * no actual overshoot), and it flags ordinary at-target inflation as a crisis
 * for those same higher-target regimes. Keying off the deviation from each
 * country's own target (already computed era-aware elsewhere, see
 * `getEraMonetaryBaseline`) fixes both directions without adding a second
 * absolute that goes stale as new eras/countries are added.
 */
const INFLATION_HOT_MARGIN = 2.0;

/**
 * Debt distress, read off the SAME credit-rating ladder `budget/debt.ts`
 * already uses to price sovereign borrowing (`DEBT_THRESHOLDS`/
 * `getDebtThreshold`) instead of a second, independent absolute
 * (`DEBT_HIGH = 1.0`). That flat 100%-of-GDP line never fired for the
 * measured 1953-cohort regression (ahd_sim_g53v4, turn ~451): YU/HU/PL/BG/RO
 * ran 93%-115% debt/GDP for a hundred-plus turns and read "expansionary" the
 * entire time, because a single-tier penalty starting at 100% and maxing out
 * at 150% is trivially outweighed by a maxed growth/employment/poverty pull
 * (+1) plus archetype appetite (+0.25). `getDebtThreshold`'s `gdpPenalty`
 * (0 at AAA/AA, 0.1 A, 0.2 BBB, 0.3 BB, 0.5 B, 0.7 CCC) is the game's own
 * measure of "how much this debt level actually hurts" - reusing it means a
 * country crossing into real distress (leaving the AA band, >60% of GDP)
 * gets an authentic, era/country-agnostic austerity pull that scales with
 * its OWN credit rating instead of a hand-picked ratio.
 */
const DEBT_DISTRESS_CEILING = 0.7; // CCC tier's gdpPenalty - normalizes to [0,1]
/**
 * How hard credit-rating distress pulls the score toward austerity.
 * Deliberately UNCAPPED (unlike the inflation term): severe debt distress must
 * be able to outweigh the maximum growth/employment/poverty pull (+1) plus the
 * most spend-hungry archetype (+0.25 reformer). A government cannot out-vote
 * its own credit rating just by wanting more, which the flat capped
 * `DEBT_HIGH` line could not express. Bands: AAA/AA (0-80% of GDP) no pull;
 * A (80-100%) flips an average government toward neutral but leaves a severe
 * unmet-need agenda expansionary; BBB (100-120%) reliably outweighs a strong
 * non-maximal pull; BB/B/CCC (120%+) decisively austere regardless of agenda.
 */
const DEBT_DISTRESS_WEIGHT = 5;

/** Growth-ish agenda domains whose "raise" priority pulls toward expansion. */
const GROWTH_DOMAINS = new Set(["economic_growth", "employment", "poverty"]);

/** Net-score band outside which the posture leaves neutral. */
const STANCE_THRESHOLD = 0.25;

/**
 * Compute the government's fiscal posture. Positive net score → expansionary
 * (spend), negative → austere (tighten). Pure, deterministic, total.
 */
export function computeFiscalStance(inputs: FiscalStanceInputs): PersistedFiscalStance {
  const { agenda, inflationRate, debtToGdpRatio, personality, currentTurn } = inputs;
  const targetInflationRate = inputs.targetInflationRate ?? DEFAULT_TARGET_INFLATION;
  const inflationHot = targetInflationRate + INFLATION_HOT_MARGIN;

  let score = 0;
  score -= fiscalDeficitPressure(inputs.fiscalBalanceGdpShare);

  // Macro headwinds toward austerity (hot inflation relative to this
  // country's own target, credit-rating-tier debt distress).
  if (inflationRate > inflationHot) score -= Math.min(1, (inflationRate - inflationHot) / 4);
  const debtPenalty = getDebtThreshold(debtToGdpRatio).gdpPenalty;
  if (debtPenalty > 0) {
    score -= (debtPenalty / DEBT_DISTRESS_CEILING) * DEBT_DISTRESS_WEIGHT;
  }

  // Agenda pull toward expansion: unmet growth/employment/poverty goals.
  let growthPull = 0;
  for (const item of agenda) {
    if (item.direction === "raise" && GROWTH_DOMAINS.has(item.domain)) growthPull += item.priority;
  }
  score += Math.min(1, growthPull);

  // Archetype spend appetite (reformer > steward) nudges the posture.
  const spendAppetiteMult = governingArchetypeModifiers(personality).spendAppetiteMult;
  score += spendAppetiteMult - 1; // ~[-0.2, +0.25]

  return scoreToStance(score, currentTurn);
}

// ── Plan stance (command / dual-track economies) ─────────────────────────────

/** Shortage index at/above this (0–100) pushes toward tightening the plan. */
const SHORTAGE_HIGH = 35;
/** Monetary overhang at/above this (0–OVERHANG_CAP) pushes toward tightening. */
const OVERHANG_HIGH = 25;
/** Below this combined pressure (0–1) the plan has room to loosen. */
const PRESSURE_LOW = 0.15;

export interface PlanStanceInputs {
  agenda: GoverningAgendaItem[];
  /** Goods scarcity at administered prices, 0 (abundant) → 100 (acute). */
  shortageIndex: number;
  /** Accumulated forced savings index (see commandEconomyState). */
  monetaryOverhang: number;
  /** 0..1 share of activity under the plan (`plannedShare`). */
  plannedShare: number;
  personality: NPPPersonality;
  currentTurn: number;
}

/**
 * Fiscal-posture sibling for planned economies. Ignores market inflation / debt
 * and instead reads shortage + monetary overhang (written by commandEconomyTurn)
 * scaled by `plannedShare`. Same return shape as `computeFiscalStance` so
 * downstream sponsorship / bill selection stays unchanged. High shortage or
 * overhang → austere (rein in the wage fund / consumption); low → expansionary.
 */
export function computePlanStance(inputs: PlanStanceInputs): PersistedFiscalStance {
  const { agenda, shortageIndex, monetaryOverhang, plannedShare, personality, currentTurn } =
    inputs;

  const share = Math.max(0, Math.min(1, Number.isFinite(plannedShare) ? plannedShare : 0));
  const shortage = Math.max(0, Math.min(100, Number.isFinite(shortageIndex) ? shortageIndex : 0));
  const overhang = Math.max(
    0,
    Math.min(100, Number.isFinite(monetaryOverhang) ? monetaryOverhang : 0)
  );

  // Combined plan-pressure in [0, 1], gated by how much of the economy is planned.
  const pressure =
    share *
    (0.6 * Math.min(1, shortage / Math.max(SHORTAGE_HIGH, 1)) +
      0.4 * Math.min(1, overhang / Math.max(OVERHANG_HIGH, 1)));

  let score = 0;
  // High shortage/overhang → tighten the plan (austere).
  if (pressure > 0.25) score -= Math.min(1, (pressure - 0.25) / 0.5);
  // Low pressure → room to loosen wage fund / consumption.
  if (pressure < PRESSURE_LOW) score += Math.min(1, (PRESSURE_LOW - pressure) / PRESSURE_LOW);

  // Soft agenda pull toward expansion (same growth domains as market fiscal).
  let growthPull = 0;
  for (const item of agenda) {
    if (item.direction === "raise" && GROWTH_DOMAINS.has(item.domain)) growthPull += item.priority;
  }
  score += Math.min(1, growthPull) * 0.5;

  const spendAppetiteMult = governingArchetypeModifiers(personality).spendAppetiteMult;
  score += spendAppetiteMult - 1;

  return scoreToStance(score, currentTurn);
}

export interface PersistedCommandStance {
  /** 0 (repress second economy) → 1 (tolerate). Feeds commandEconomyTurn. */
  secondEconomyTolerance: number;
  /** 0 (loose plan) → 1 (tight plan); derived from the plan stance. */
  planTightness: number;
  // ── Command Economy v2 (P1): the NPP-brain Gosbank posture ────────────────
  /** 0 (restrained credit) → 1 (flood SOEs with cheap directed credit). Orthodox
   *  planners fund aggressively to hit quotas; reformers hold back. */
  creditAggressiveness: number;
  /** 0 (hard budgets: let insolvent SOEs fold) → 1 (soft: bail everyone). NPP
   *  default is fairly SOFT (historical planned-economy behaviour). */
  budgetSoftness: number;
  /** Signed reform-vs-orthodox read of the GOVERNMENT (−1 hardline orthodox …
   *  +1 reformist), from the head's economic scalar + archetype. One of the two
   *  inputs (with Gosbank posture) to the marketization policy-stance term. */
  reformism: number;
  /** 0 (no repression) → 1 (heavy). The hardliner's lever to force the second
   *  economy down and resist reform. Derived from reformism (orthodox →
   *  moderate-to-high, reformist → low). Honored by `commandEconomyTurn`. */
  internalRepression: number;
  computedTurn: number;
}

/**
 * Per-country command-economy levers for a planned NPP government. Ideologues /
 * stewards and very-left economic positions repress the second economy, fund
 * SOEs aggressively and keep budgets soft; reformers / technocrats tolerate more
 * grey-market relief, fund selectively and run harder budgets.
 */
export function deriveCommandStance(opts: {
  personality: NPPPersonality;
  /** Head's economic policy scalar (−5 left/command … +5 right/market). */
  economic: number;
  planStance: PersistedFiscalStance;
  currentTurn: number;
}): PersistedCommandStance {
  const { personality, economic, planStance, currentTurn } = opts;
  const archetype = deriveGoverningArchetype(personality);
  const econ = Number.isFinite(economic) ? economic : 0;

  // Base tolerance by archetype (0 repress … 1 tolerate).
  let tolerance =
    archetype === "ideologue"
      ? 0.12
      : archetype === "steward"
        ? 0.18
        : archetype === "technocrat"
          ? 0.4
          : 0.55; // reformer

  // Very-left economic → repressive; market-leaning → more tolerant.
  if (econ <= -3) tolerance = Math.min(tolerance, 0.12);
  else if (econ <= -1) tolerance *= 0.85;
  else if (econ >= 2) tolerance = Math.min(1, tolerance + 0.15);

  tolerance = Math.max(0, Math.min(1, tolerance));

  // Plan tightness mirrors stance: austere → high, expansionary → low.
  const planTightness =
    planStance.stance === "austere"
      ? 0.5 + 0.5 * planStance.intensity
      : planStance.stance === "expansionary"
        ? 0.5 - 0.5 * planStance.intensity
        : 0.5;

  // ── Gosbank posture (P1) ──────────────────────────────────────────────────
  // Budget softness: orthodox archetypes keep budgets soft (bail everyone);
  // reformers/technocrats harden them. Market-leaning economic hardens further.
  let budgetSoftness =
    archetype === "ideologue"
      ? 0.9
      : archetype === "steward"
        ? 0.85
        : archetype === "technocrat"
          ? 0.7
          : 0.55; // reformer
  if (econ >= 2) budgetSoftness -= 0.15;
  else if (econ <= -3) budgetSoftness = Math.min(1, budgetSoftness + 0.05);
  budgetSoftness = Math.max(0, Math.min(1, budgetSoftness));

  // Credit aggressiveness: orthodox planners flood credit to force plan
  // fulfillment; reformers fund selectively. A tighter plan pushes more credit
  // out to hit the raised quotas.
  let creditAggressiveness =
    archetype === "ideologue"
      ? 0.75
      : archetype === "steward"
        ? 0.65
        : archetype === "technocrat"
          ? 0.5
          : 0.4; // reformer
  creditAggressiveness += (planTightness - 0.5) * 0.3;
  if (econ >= 2) creditAggressiveness -= 0.1;
  creditAggressiveness = Math.max(0, Math.min(1, creditAggressiveness));

  // Government reformism (signed): from the economic scalar, biased by archetype.
  const archetypeBias = archetype === "reformer" ? 0.3 : archetype === "ideologue" ? -0.3 : 0;
  const reformism = Math.max(-1, Math.min(1, econ / 5 + archetypeBias));

  // Internal repression: the orthodox regime's tool to force the second economy
  // down and resist reform. Derived from the same reformism read (orthodox →
  // moderate-to-high, reformist → low) so the brain's repression and reform
  // postures stay consistent.
  const internalRepression = internalRepressionFromReformism(reformism);

  return {
    secondEconomyTolerance: tolerance,
    planTightness: Math.max(0, Math.min(1, planTightness)),
    creditAggressiveness,
    budgetSoftness,
    reformism,
    internalRepression,
    computedTurn: currentTurn,
  };
}

function scoreToStance(score: number, currentTurn: number): PersistedFiscalStance {
  let stance: FiscalStance = "neutral";
  let direction: -1 | 0 | 1 = 0;
  if (score >= STANCE_THRESHOLD) {
    stance = "expansionary";
    direction = -1;
  } else if (score <= -STANCE_THRESHOLD) {
    stance = "austere";
    direction = 1;
  }
  const intensity = Math.min(1, Math.abs(score));
  return { stance, direction, intensity, computedTurn: currentTurn };
}
