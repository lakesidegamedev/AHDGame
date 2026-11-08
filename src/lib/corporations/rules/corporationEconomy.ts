import { getSectorTypeMatchModifier } from "@/lib/corporations/specialization/rules";
import type { StateMetricMarginOverride } from "@/lib/corporations/stateMetricMarginTypes";
import {
  INVESTOR_CONFIDENCE_BASELINE,
  EXPROPRIATION_RISK_MARGIN_MAX,
} from "@/lib/nationalization/constants";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import {
  GROWTH_COST_MULTIPLIER,
  TURNS_PER_DAY,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";
import {
  MARKETING_BASE_GAIN_PER_TURN,
  MARKETING_BUDGET_SCALE,
  MARKETING_DIMINISHING_THRESHOLD,
  HOME_STATE_MARGIN_BONUS,
  HOME_NATION_MARGIN_BONUS,
  STATE_PRIMARY_SECTOR_MARGIN_BONUS,
  STATE_SECONDARY_SECTOR_MARGIN_BONUS,
  MARGIN_SOFT_CAP_KNEE,
  MARGIN_HARD_CEILING,
  DOMINANCE_MARKET_SHARE_THRESHOLD,
  DOMINANCE_NATIONAL_SHARE_THRESHOLD,
  DOMINANCE_RAMP_EXPONENT,
  DOMINANCE_GROWTH_COST_MULT_AT_FULL,
  DOMINANCE_ATTACK_EASE_MULT_AT_FULL,
  DOMINANCE_MARGIN_PENALTY_AT_THRESHOLD,
  DOMINANCE_MARGIN_PENALTY_AT_FULL,
  DOMINANCE_REGULATORY_BURDEN_AT_THRESHOLD,
  DOMINANCE_REGULATORY_BURDEN_AT_FULL,
  DOMINANCE_DENSITY_CROWDED_COMPETITORS,
  DOMINANCE_DENSITY_MIN_FACTOR,
  UNDERDOG_DEFENDER_MIN_SHARE,
  UNDERDOG_ATTACKER_FULL_BONUS_SHARE,
  UNDERDOG_ATTACKER_NO_BONUS_SHARE,
  UNDERDOG_AMPLIFIER_MAX,
  SUSTAINED_NEGATIVE_PRODUCTION_GRACE_TURNS,
  SUSTAINED_NEGATIVE_PRODUCTION_FULL_TURNS,
  SUSTAINED_NEGATIVE_PRODUCTION_MAX_PENALTY,
  ACUMEN_GROWTH_COST_SLOPE,
  ACUMEN_RATE_SENSITIVITY_SLOPE,
  SECTOR_RISK_PREMIUM,
  WORKFORCE_SKILL_SECTORS,
  CRIME_RATE_SECTORS,
  BROADBAND_SECTORS,
  ROAD_CONDITION_SECTORS,
  CARBON_EMISSIONS_SECTORS,
  COST_OF_LIVING_SECTORS,
  UNEMPLOYMENT_PIVOT,
  UNEMPLOYMENT_MAX_MODIFIER,
  UNEMPLOYMENT_HIGH,
  GRID_RELIABILITY_GATE,
  GRID_RELIABILITY_FLOOR,
  GRID_RELIABILITY_MAX_PENALTY,
  CORRUPTION_MAX_PENALTY,
  CORRUPTION_MAX_VALUE,
  WORKFORCE_SKILL_PIVOT,
  WORKFORCE_SKILL_MAX_MODIFIER,
  CRIME_RATE_LOW,
  CRIME_RATE_HIGH,
  CRIME_RATE_MAX_PENALTY,
  BROADBAND_GATE,
  BROADBAND_FLOOR,
  BROADBAND_MAX_PENALTY,
  ROAD_CONDITION_PIVOT,
  ROAD_CONDITION_MAX_MODIFIER,
  CARBON_EMISSIONS_LOW,
  CARBON_EMISSIONS_HIGH,
  CARBON_EMISSIONS_MAX_PENALTY,
  COST_OF_LIVING_PIVOT,
  COST_OF_LIVING_RANGE,
  COST_OF_LIVING_MAX_MODIFIER,
  type StateSectorSpecialization,
  INFLATION_TARGET,
  INFLATION_LOW_MAX_BONUS,
  INFLATION_HIGH_MAX_PENALTY,
  INFLATION_HIGH_THRESHOLD,
  DEFLATION_PENALTY_COEFF,
  DEBT_TO_GDP_MAX_PENALTY,
  DEFICIT_MARGIN_BONUS_PER_PERCENT,
  DEFICIT_MARGIN_MAX_BONUS,
  TYPE_SWITCH_MARGIN_PENALTY,
  SPRAWL_SECTOR_THRESHOLD,
  SPRAWL_PENALTY_PER_PAIR,
  LOGISTICS_DECAY_RATE,
  LOGISTICS_GROWTH_SCALE,
  LOGISTICS_BUDGET_DENOM,
  LOGISTICS_MAX_SPRAWL_EFFECT,
  RD_BASE_GAIN_PER_TURN,
  RD_BUDGET_SCALE,
  RD_DIMINISHING_THRESHOLD,
  RD_DECAY_RATE,
  RD_MORALE_MAX_SWING,
  RD_MORALE_SENSITIVITY,
  MANAGEMENT_OVERHEAD_FREE_PLANTS,
  LOGISTICS_SHIPPING_DISCOUNT_MAX,
  type MarginModifiers,
  type StateMetricValues,
  type MacroEconomicValues,
} from "@/lib/constants/corporationsTables";

/**
 * Calculate marketing strength growth per turn.
 * - Base gain of 1 MS/turn if any spending
 * - Budget scaling: 0.65 × ln(1 + budget/100k) — strong diminishing at high spend
 *   $100k → ~1.5/turn, $2M → ~3/turn, $10M → ~4/turn
 * - Stored MS diminishing: 100/(100 + ms + excess), doubles past 100 MS
 */
export function calcMarketingGrowth(dailyBudget: number, currentStrength: number): number {
  if (dailyBudget <= 0) return 0;
  const base = MARKETING_BASE_GAIN_PER_TURN;
  const scaled = MARKETING_BUDGET_SCALE * Math.log(1 + dailyBudget / 100_000);
  const raw = base + scaled;
  // Diminishing returns on stored MS; doubles past the threshold
  const excess = Math.max(0, currentStrength - MARKETING_DIMINISHING_THRESHOLD);
  const diminishing =
    MARKETING_DIMINISHING_THRESHOLD / (MARKETING_DIMINISHING_THRESHOLD + currentStrength + excess);
  return raw * diminishing;
}

/**
 * Soft-cap an additive margin stack. At or below {@link MARGIN_SOFT_CAP_KNEE}
 * the value is returned unchanged (and negative margins pass straight through —
 * loss-makers still drain cash). Above the knee the excess is compressed with a
 * tanh so the result rises monotonically toward {@link MARGIN_HARD_CEILING}
 * without a flat target to pin against. C1-continuous at the knee (tanh'(0)=1),
 * so there is no kink where compression begins.
 */
export function softCapEffectiveMargin(rawMargin: number): number {
  if (!Number.isFinite(rawMargin)) return 0;
  if (rawMargin <= MARGIN_SOFT_CAP_KNEE) return rawMargin;
  const span = MARGIN_HARD_CEILING - MARGIN_SOFT_CAP_KNEE;
  return MARGIN_SOFT_CAP_KNEE + span * Math.tanh((rawMargin - MARGIN_SOFT_CAP_KNEE) / span);
}

/**
 * Revenue generated per worker (daily rate).
 * At $1M revenue, a neutral-skill sector needs 500 workers.
 *
 * Headcount is now enforced against the state's real labour force, so this is
 * an economic productivity anchor rather than a display scale. Keep it in
 * lockstep with `CAPACITY_REVENUE_PER_WORKER`.
 */
const REVENUE_PER_WORKER = 2_000;

/**
 * Maximum workforce skill adjustment to worker count (±30%).
 * At skill=100: workers × 0.70 (highly productive, fewer needed).
 * At skill=0: workers × 1.30 (unskilled, more needed).
 * At skill=50: workers × 1.00 (neutral).
 */
const WORKFORCE_SKILL_WORKER_MAX_ADJUSTMENT = 0.3;

/**
 * Calculate the number of workers for a sector based on revenue and
 * the state's workforce skill metric.
 *
 * @param revenue - Sector's daily revenue
 * @param workforceSkill - State's workforce skill metric (0–100, null defaults to 50)
 * @returns Number of workers (integer, minimum 1)
 */
export function calculateWorkers(
  revenue: number,
  workforceSkill: number | null | undefined
): number {
  const baseWorkers = revenue / REVENUE_PER_WORKER;
  const skill = workforceSkill ?? 50;
  const clamped = Math.max(0, Math.min(100, skill));
  // skill 50 → multiplier 1.0, skill 100 → 0.70, skill 0 → 1.30
  const skillMultiplier = 1 - ((clamped - 50) / 50) * WORKFORCE_SKILL_WORKER_MAX_ADJUSTMENT;
  return Math.max(1, Math.round(baseWorkers * skillMultiplier));
}

/**
 * Scales the dominance toll by how contested the market actually is.
 *
 * Returns {@link DOMINANCE_DENSITY_MIN_FACTOR} with no rivals, ramping linearly
 * to 1 at {@link DOMINANCE_DENSITY_CROWDED_COMPETITORS}. Applied to the toll's
 * EXCESS over 1.0, never to the base price, so a market with no rivals still
 * pays a real (if smaller) monopoly premium and the ramp stays continuous.
 *
 * `competitorCount` counts distinct rival CORPORATIONS holding a sector in the
 * cell, excluding the building corp's own. Absent/invalid ⇒ crowded (factor 1),
 * so a caller that cannot resolve density never gets a silent discount.
 */
export function dominanceDensityFactor(competitorCount: number | null | undefined): number {
  if (!Number.isFinite(competitorCount as number) || (competitorCount as number) < 0) return 1;
  const rivals = Math.min(competitorCount as number, DOMINANCE_DENSITY_CROWDED_COMPETITORS);
  const t = rivals / DOMINANCE_DENSITY_CROWDED_COMPETITORS;
  return DOMINANCE_DENSITY_MIN_FACTOR + (1 - DOMINANCE_DENSITY_MIN_FACTOR) * t;
}

function dominanceMultiplier(
  marketSharePercent: number,
  atFull: number,
  threshold: number = DOMINANCE_MARKET_SHARE_THRESHOLD
): number {
  const share = Math.max(0, Math.min(100, marketSharePercent));
  if (share <= threshold) return 1;
  const range = 100 - threshold;
  const t = (share - threshold) / range;
  // Convex ramp from 1.0× at the threshold to atFull× at 100% share — continuous
  // (no cliff), with the cost back-loaded toward monopoly via DOMINANCE_RAMP_EXPONENT.
  return 1 + (atFull - 1) * Math.pow(t, DOMINANCE_RAMP_EXPONENT);
}

/**
 * Linear scaling helper for dominance modifiers that should return 0 below the
 * threshold (rather than 1.0×). Used by the margin-penalty and regulatory-
 * burden helpers, which are additive rather than multiplicative.
 */
function dominanceAdditive(
  marketSharePercent: number,
  atThreshold: number,
  atFull: number,
  threshold: number = DOMINANCE_MARKET_SHARE_THRESHOLD
): number {
  const share = Math.max(0, Math.min(100, marketSharePercent));
  if (share <= threshold) return 0;
  const range = 100 - threshold;
  const t = (share - threshold) / range;
  return atThreshold + t * (atFull - atThreshold);
}

/**
 * Growth-cost multiplier for a sector based on its market share within its
 * (state, sectorType). Returns 1.0 at or below the threshold and ramps convexly
 * (see {@link DOMINANCE_RAMP_EXPONENT}) to
 * {@link DOMINANCE_GROWTH_COST_MULT_AT_FULL} at 100% — no discontinuity at the
 * threshold, so a sector can cross into dominance without a sudden cost wall.
 */
export function getDominanceGrowthCostMultiplier(marketSharePercent: number): number {
  return dominanceMultiplier(marketSharePercent, DOMINANCE_GROWTH_COST_MULT_AT_FULL);
}

/**
 * Attack-capture multiplier when a rival corp attacks this sector. 1.0 at or
 * below the threshold, ramping convexly (see {@link DOMINANCE_RAMP_EXPONENT})
 * to {@link DOMINANCE_ATTACK_EASE_MULT_AT_FULL} at 100% share. Multiplied into
 * the contested fraction so a sector grows steadily more vulnerable as it nears
 * monopoly, rather than becoming sharply easier to attack the instant it crosses
 * the threshold.
 */
export function getDominanceAttackEaseMultiplier(marketSharePercent: number): number {
  return dominanceMultiplier(marketSharePercent, DOMINANCE_ATTACK_EASE_MULT_AT_FULL);
}

/**
 * Margin penalty (percentage points) for a sector based on its market share.
 * 0 at or below the dominance threshold, scaling linearly to
 * {@link DOMINANCE_MARGIN_PENALTY_AT_FULL} at 100% share. Summed into the
 * sector's effective margin alongside the other modifiers.
 */
export function getDominanceMarginPenalty(marketSharePercent: number): number {
  return dominanceAdditive(
    marketSharePercent,
    DOMINANCE_MARGIN_PENALTY_AT_THRESHOLD,
    DOMINANCE_MARGIN_PENALTY_AT_FULL
  );
}

/**
 * Fraction of hourly revenue a dominant sector pays as a passive regulatory
 * burden (compliance, antitrust legal, lobbying). Returns 0 at or below the
 * threshold, scaling linearly to {@link DOMINANCE_REGULATORY_BURDEN_AT_FULL}
 * at 100% share. Deducted from sector revenue before profit is computed —
 * separate from margin so the diagnostic UI can show it independently.
 */
export function getDominanceRegulatoryBurden(marketSharePercent: number): number {
  return dominanceAdditive(
    marketSharePercent,
    DOMINANCE_REGULATORY_BURDEN_AT_THRESHOLD,
    DOMINANCE_REGULATORY_BURDEN_AT_FULL
  );
}

/**
 * National-share twins of the dominance tolls: same ramp shape and same
 * at-full magnitudes, but starting from {@link DOMINANCE_NATIONAL_SHARE_THRESHOLD}
 * (30%) instead of the per-cell 50%. These charge on a corp's aggregate share of
 * a whole (country, sectorType). The turn takes the HARSHER of each local and
 * national toll (min for the negative margin penalty, max for the positive
 * growth-cost multiplier and regulatory burden) so a nationally dominant corp
 * cannot escape antitrust by staying under 50% in every individual state.
 */
export function getNationalDominanceMarginPenalty(nationalSharePercent: number): number {
  return dominanceAdditive(
    nationalSharePercent,
    DOMINANCE_MARGIN_PENALTY_AT_THRESHOLD,
    DOMINANCE_MARGIN_PENALTY_AT_FULL,
    DOMINANCE_NATIONAL_SHARE_THRESHOLD
  );
}

export function getNationalDominanceRegulatoryBurden(nationalSharePercent: number): number {
  return dominanceAdditive(
    nationalSharePercent,
    DOMINANCE_REGULATORY_BURDEN_AT_THRESHOLD,
    DOMINANCE_REGULATORY_BURDEN_AT_FULL,
    DOMINANCE_NATIONAL_SHARE_THRESHOLD
  );
}

export function getNationalDominanceGrowthCostMultiplier(nationalSharePercent: number): number {
  return dominanceMultiplier(
    nationalSharePercent,
    DOMINANCE_GROWTH_COST_MULT_AT_FULL,
    DOMINANCE_NATIONAL_SHARE_THRESHOLD
  );
}

/**
 * Underdog amplifier on attack capture. Returns 1.0× (no bonus) unless the
 * defender is dominant (>{@link UNDERDOG_DEFENDER_MIN_SHARE}%) AND the attacker
 * is materially smaller (<{@link UNDERDOG_ATTACKER_NO_BONUS_SHARE}%) in the
 * same (state, sectorType) cell. Below {@link UNDERDOG_ATTACKER_FULL_BONUS_SHARE}%
 * the attacker gets the full {@link UNDERDOG_AMPLIFIER_MAX}; between the two
 * thresholds the bonus tapers linearly to 1.0×.
 */
export function getUnderdogAttackAmplifier(
  attackerSharePercent: number,
  defenderSharePercent: number
): number {
  if (defenderSharePercent <= UNDERDOG_DEFENDER_MIN_SHARE) return 1;
  if (attackerSharePercent >= UNDERDOG_ATTACKER_NO_BONUS_SHARE) return 1;
  if (attackerSharePercent <= UNDERDOG_ATTACKER_FULL_BONUS_SHARE) return UNDERDOG_AMPLIFIER_MAX;
  // Linear taper from full bonus to 1.0× across the gap.
  const t =
    (UNDERDOG_ATTACKER_NO_BONUS_SHARE - attackerSharePercent) /
    (UNDERDOG_ATTACKER_NO_BONUS_SHARE - UNDERDOG_ATTACKER_FULL_BONUS_SHARE);
  return 1 + (UNDERDOG_AMPLIFIER_MAX - 1) * t;
}

/**
 * Margin penalty for a sector that has been at `productionPolicyLevel < 0` for
 * `turnsSustained` turns (the counter increments while negative, decrements
 * while non-negative, floored at 0). Returns 0 if the current policy level is
 * non-negative (no penalty once corrected) or within the grace period; scales
 * linearly to {@link SUSTAINED_NEGATIVE_PRODUCTION_MAX_PENALTY} at the full
 * threshold; clamped beyond.
 */
export function getSustainedNegativeProductionPenalty(
  turnsSustained: number,
  currentPolicyLevel: number
): number {
  // Penalty clears immediately when policy is no longer negative
  if (currentPolicyLevel >= 0) return 0;

  const t = Math.max(0, turnsSustained);
  if (t <= SUSTAINED_NEGATIVE_PRODUCTION_GRACE_TURNS) return 0;
  if (t >= SUSTAINED_NEGATIVE_PRODUCTION_FULL_TURNS) {
    return SUSTAINED_NEGATIVE_PRODUCTION_MAX_PENALTY;
  }
  const range =
    SUSTAINED_NEGATIVE_PRODUCTION_FULL_TURNS - SUSTAINED_NEGATIVE_PRODUCTION_GRACE_TURNS;
  const progress = (t - SUSTAINED_NEGATIVE_PRODUCTION_GRACE_TURNS) / range;
  return progress * SUSTAINED_NEGATIVE_PRODUCTION_MAX_PENALTY;
}

/**
 * Update the sustained-negative-production counter for a sector. Increments by
 * 1 if the current policy level is negative; decrements by 1 (floored at 0)
 * otherwise. So a corp that briefly dipped to -25 for 30 turns then recovered
 * needs another 30 turns at neutral-or-positive to fully clear the counter,
 * preventing oscillation exploits.
 */
export function nextNegativeProductionCounter(
  prevCounter: number | null | undefined,
  currentPolicyLevel: number
): number {
  const prev = prevCounter ?? 0;
  if (currentPolicyLevel < 0) return prev + 1;
  return Math.max(0, prev - 1);
}

/** Higher Business Acumen → cheaper growth. Clamped to stay gentle. */
export function acumenGrowthCostMultiplier(acumen: number): number {
  return Math.max(0.5, 1 - (acumen - NEUTRAL_STAT) * ACUMEN_GROWTH_COST_SLOPE);
}

/** Higher Business Acumen → feels less of the prime-rate growth penalty. */
export function acumenRateSensitivity(acumen: number): number {
  return Math.max(0, 1 - (acumen - NEUTRAL_STAT) * ACUMEN_RATE_SENSITIVITY_SLOPE);
}

export function calculateDailyGrowthCost(
  revenue: number,
  perTurnGrowthRate: number,
  primeRate: number,
  marketSharePercent: number = 0,
  acumen: number = NEUTRAL_STAT
): number {
  // A high-Acumen CEO is less exposed to the prime-rate penalty (the rate term is
  // dampened) and pays a flat discount on top — modelling sharper capital
  // management. Neutral acumen reproduces the legacy `1 + primeRate / 10` curve.
  const rateMultiplier = Math.max(0.5, 1 + (primeRate / 10) * acumenRateSensitivity(acumen));
  const dominanceMult = getDominanceGrowthCostMultiplier(marketSharePercent);
  return (
    revenue *
    (perTurnGrowthRate / 100) *
    GROWTH_COST_MULTIPLIER *
    TURNS_PER_DAY *
    rateMultiplier *
    dominanceMult *
    acumenGrowthCostMultiplier(acumen)
  );
}

/** Cost-of-capital risk premium for a corp type (the standing table, `default` fallback). */
export function getSectorRiskPremium(corpType: string | null | undefined): number {
  return SECTOR_RISK_PREMIUM[corpType as string] ?? SECTOR_RISK_PREMIUM.default;
}

/**
 * Compute profit margin modifier from state unemployment rate.
 * - Below 3%: linear scale to -5% (tight labor → higher wages → lower margins)
 * - Above 3%: linear scale to +5% at 10%+ (cheap labor → higher margins)
 * - At 3%: 0% modifier
 */
export function getUnemploymentMarginModifier(unemploymentRate: number | null | undefined): number {
  if (unemploymentRate == null) return 0;
  if (unemploymentRate <= UNEMPLOYMENT_PIVOT) {
    return (
      ((unemploymentRate - UNEMPLOYMENT_PIVOT) / UNEMPLOYMENT_PIVOT) * UNEMPLOYMENT_MAX_MODIFIER
    );
  }
  const range = UNEMPLOYMENT_HIGH - UNEMPLOYMENT_PIVOT;
  const ratio = Math.min((unemploymentRate - UNEMPLOYMENT_PIVOT) / range, 1);
  return ratio * UNEMPLOYMENT_MAX_MODIFIER;
}

/**
 * Compute profit margin modifier from state power grid reliability.
 * Gated effect: no impact above 95% uptime. Below 95%, linear penalty
 * scaling to -4% at 85% or lower. Affects ALL sectors — every business
 * needs electricity.
 *
 * - Above 95%: 0% modifier (grid is reliable enough)
 * - 85–95%: linear scale from 0% to -4%
 * - Below 85%: capped at -4%
 */
export function getGridReliabilityMarginModifier(reliability: number | null | undefined): number {
  if (reliability == null) return 0;
  if (reliability >= GRID_RELIABILITY_GATE) return 0;
  if (reliability <= GRID_RELIABILITY_FLOOR) return -GRID_RELIABILITY_MAX_PENALTY;
  const range = GRID_RELIABILITY_GATE - GRID_RELIABILITY_FLOOR;
  const ratio = (GRID_RELIABILITY_GATE - reliability) / range;
  return -ratio * GRID_RELIABILITY_MAX_PENALTY;
}

/**
 * Compute profit margin modifier from state corruption index.
 * Higher corruption = higher costs from bribes, unpredictable enforcement,
 * regulatory shakedowns, and contract uncertainty.
 *
 * - At 0 corruption: 0% modifier
 * - Linear scale to -3% at corruption index 100
 */
export function getCorruptionMarginModifier(corruptionIndex: number | null | undefined): number {
  if (corruptionIndex == null) return 0;
  const clamped = Math.max(0, Math.min(CORRUPTION_MAX_VALUE, corruptionIndex));
  return -(clamped / CORRUPTION_MAX_VALUE) * CORRUPTION_MAX_PENALTY;
}

/**
 * Compute profit margin modifier from state workforce skill.
 * Only applies to: technology, chemical_industries, healthcare, manufacturing, defense.
 *
 * - At 50: 0% modifier
 * - Below 50: linear penalty to -4% at 0 (unskilled labor → higher training/error costs)
 * - Above 50: linear bonus to +4% at 100 (skilled labor → higher productivity)
 */
export function getWorkforceSkillMarginModifier(workforceSkill: number | null | undefined): number {
  if (workforceSkill == null) return 0;
  const clamped = Math.max(0, Math.min(100, workforceSkill));
  if (clamped >= WORKFORCE_SKILL_PIVOT) {
    return (
      ((clamped - WORKFORCE_SKILL_PIVOT) / (100 - WORKFORCE_SKILL_PIVOT)) *
      WORKFORCE_SKILL_MAX_MODIFIER
    );
  }
  return ((clamped - WORKFORCE_SKILL_PIVOT) / WORKFORCE_SKILL_PIVOT) * WORKFORCE_SKILL_MAX_MODIFIER;
}

/**
 * Compute profit margin modifier from state crime rate (incidents per 100k).
 * Only applies to: retail, real_estate, entertainment.
 *
 * - At or below 1500 per 100k: 0% modifier
 * - Linear penalty to -5% at 3500+ per 100k (theft, vandalism, lower foot traffic)
 */
export function getCrimeRateMarginModifier(crimeRate: number | null | undefined): number {
  if (crimeRate == null) return 0;
  if (crimeRate <= CRIME_RATE_LOW) return 0;
  if (crimeRate >= CRIME_RATE_HIGH) return -CRIME_RATE_MAX_PENALTY;
  return (
    -((crimeRate - CRIME_RATE_LOW) / (CRIME_RATE_HIGH - CRIME_RATE_LOW)) * CRIME_RATE_MAX_PENALTY
  );
}

/**
 * Compute profit margin modifier from state broadband access (%).
 * Only applies to: technology, telecommunications, media, financial.
 *
 * Gated effect: no impact at or above 70%. Below 70%, linear penalty
 * scaling to -4% at 40% or lower.
 *
 * - At or above 70%: 0% modifier
 * - 40–70%: linear scale from 0% to -4%
 * - Below 40%: capped at -4%
 */
export function getBroadbandMarginModifier(broadbandAccess: number | null | undefined): number {
  if (broadbandAccess == null) return 0;
  if (broadbandAccess >= BROADBAND_GATE) return 0;
  if (broadbandAccess <= BROADBAND_FLOOR) return -BROADBAND_MAX_PENALTY;
  const range = BROADBAND_GATE - BROADBAND_FLOOR;
  const ratio = (BROADBAND_GATE - broadbandAccess) / range;
  return -ratio * BROADBAND_MAX_PENALTY;
}

/**
 * Compute profit margin modifier from state road condition (0–100 index).
 * Only applies to: manufacturing, retail, agriculture, the vehicles lane, construction.
 *
 * - At 60: 0% modifier
 * - Below 60: linear penalty to -3% at 0 (poor roads raise logistics costs)
 * - Above 60: linear bonus to +3% at 100 (good roads lower distribution costs)
 */
export function getRoadConditionMarginModifier(roadCondition: number | null | undefined): number {
  if (roadCondition == null) return 0;
  const clamped = Math.max(0, Math.min(100, roadCondition));
  if (clamped >= ROAD_CONDITION_PIVOT) {
    return (
      ((clamped - ROAD_CONDITION_PIVOT) / (100 - ROAD_CONDITION_PIVOT)) *
      ROAD_CONDITION_MAX_MODIFIER
    );
  }
  return ((clamped - ROAD_CONDITION_PIVOT) / ROAD_CONDITION_PIVOT) * ROAD_CONDITION_MAX_MODIFIER;
}

/**
 * Compute profit margin modifier from state carbon emissions (MT per capita).
 * Only applies to: energy, manufacturing, the vehicles lane.
 *
 * Higher emissions = higher regulatory & compliance costs.
 * - At or below 3 MT: 0% modifier
 * - Linear penalty to -3% at 25+ MT (regulatory burden, carbon taxes)
 */
export function getCarbonEmissionsMarginModifier(
  carbonEmissions: number | null | undefined
): number {
  if (carbonEmissions == null) return 0;
  if (carbonEmissions <= CARBON_EMISSIONS_LOW) return 0;
  if (carbonEmissions >= CARBON_EMISSIONS_HIGH) return -CARBON_EMISSIONS_MAX_PENALTY;
  return (
    -((carbonEmissions - CARBON_EMISSIONS_LOW) / (CARBON_EMISSIONS_HIGH - CARBON_EMISSIONS_LOW)) *
    CARBON_EMISSIONS_MAX_PENALTY
  );
}

/**
 * Compute profit margin modifier from state cost of living index (100 = national avg).
 * Only applies to: manufacturing, retail, agriculture.
 *
 * Higher cost of living raises labor costs for physical-presence businesses.
 * - At 100 (national avg): 0% modifier
 * - Below 100: linear bonus to +3% at 70 or lower (cheap labor → higher margins)
 * - Above 100: linear penalty to -3% at 130 or higher (expensive labor → lower margins)
 */
export function getCostOfLivingMarginModifier(costOfLiving: number | null | undefined): number {
  if (costOfLiving == null) return 0;
  const mod =
    ((COST_OF_LIVING_PIVOT - costOfLiving) / COST_OF_LIVING_RANGE) * COST_OF_LIVING_MAX_MODIFIER;
  return Math.max(-COST_OF_LIVING_MAX_MODIFIER, Math.min(COST_OF_LIVING_MAX_MODIFIER, mod));
}

/**
 * Expropriation-risk margin drag from low investor confidence (spec §12.4 feed 1).
 * 0 at/above baseline; scales linearly to EXPROPRIATION_RISK_MARGIN_MAX at
 * confidence 0. Applied to PRIVATE corps only — the caller gates on isStateOwned.
 */
export function getExpropriationRiskMarginModifier(
  investorConfidence: number | null | undefined
): number {
  if (investorConfidence == null || !Number.isFinite(investorConfidence)) return 0;
  if (investorConfidence >= INVESTOR_CONFIDENCE_BASELINE) return 0;
  const below = INVESTOR_CONFIDENCE_BASELINE - Math.max(0, investorConfidence);
  const frac = below / INVESTOR_CONFIDENCE_BASELINE; // 0..1
  return EXPROPRIATION_RISK_MARGIN_MAX * frac;
}

/**
 * Profit margin bonus for home state/nation. International sectors get 0.
 * - Home state (sector in HQ state): +5%
 * - Home nation (same country, different state): +2.5%
 * - International (different country): 0%
 */
export function getHomeLocationMarginBonus(
  sectorStateId: string,
  headquartersState: string,
  sectorCountryId: string,
  hqCountryId: string
): number {
  if (sectorStateId === headquartersState) return HOME_STATE_MARGIN_BONUS;
  if (sectorCountryId === hqCountryId) return HOME_NATION_MARGIN_BONUS;
  return 0;
}

/**
 * Profit margin bonus for state/region sector specializations.
 * - Primary sector: +5 percentage points
 * - Secondary sector: +2.5 percentage points
 */
export function getStateSectorSpecializationMarginBonus(
  specialization: StateSectorSpecialization | null | undefined,
  sectorType: OperatingSectorType
): number {
  if (!specialization) return 0;
  if (specialization.primary === sectorType) return STATE_PRIMARY_SECTOR_MARGIN_BONUS;
  if (specialization.secondary === sectorType) return STATE_SECONDARY_SECTOR_MARGIN_BONUS;
  return 0;
}

/**
 * Compute profit margin modifier from national inflation rate.
 * Applied at the country level (all sectors in that country).
 *
 * - Below 0% (deflation): penalty at 2× the per-pp rate of the inflation penalty
 * - 0% to 2% (below target): linear bonus to +2% at 0% (low prices = margin-friendly)
 * - Above 2%: linear penalty to -8% at 10%+ (rising input costs squeeze margins)
 * - At 2%: 0% modifier
 */
export function getInflationMarginModifier(inflationRate: number | null | undefined): number {
  if (inflationRate == null) return 0;
  if (inflationRate < 0) {
    // Deflation: each pp below 0% applies a penalty at 2× the inflation penalty rate
    return inflationRate * DEFLATION_PENALTY_COEFF;
  }
  if (inflationRate <= INFLATION_TARGET) {
    // Below target but non-negative: linear bonus from 0 at target to +BONUS at 0%
    return ((INFLATION_TARGET - inflationRate) / INFLATION_TARGET) * INFLATION_LOW_MAX_BONUS;
  }
  // Above target: penalty scales linearly to max at threshold
  const excess = inflationRate - INFLATION_TARGET;
  const range = INFLATION_HIGH_THRESHOLD - INFLATION_TARGET;
  const ratio = Math.min(excess / range, 1);
  return -ratio * INFLATION_HIGH_MAX_PENALTY;
}

/**
 * Compute profit margin modifier from national debt-to-GDP ratio.
 * Applied at the country level (all sectors in that country).
 *
 * - Below 50%: no effect
 * - 50–100%: -0.5% penalty per 10% of debt-to-GDP (e.g. 80% → -1.5%)
 * - Above 100%: -2.5% (for 50-100 range) plus -1% per 10% over 100%
 *   (e.g. 130% → -2.5% - 3% = -5.5%)
 * - Capped at -15% to prevent runaway penalties at extreme debt levels
 */
export function getDebtToGdpMarginModifier(debtToGdpRatio: number | null | undefined): number {
  if (debtToGdpRatio == null) return 0;
  const pct = debtToGdpRatio * 100; // Convert ratio to percentage
  if (pct <= 50) return 0;
  if (pct <= 100) {
    // -0.5% per 10% of debt-to-GDP in the 50-100 range
    return -((pct - 50) / 10) * 0.5;
  }
  // Base penalty for 50-100% range: -2.5%
  const basePenalty = -2.5;
  // Additional: -1% per 10% over 100%
  const overPenalty = -((pct - 100) / 10) * 1.0;
  return Math.max(DEBT_TO_GDP_MAX_PENALTY, basePenalty + overPenalty);
}

export function getDeficitToGdpMarginModifier(
  surplusToGdpRatio: number | null | undefined
): number {
  if (surplusToGdpRatio == null) return 0;
  // surplusToGdpRatio is negative when there's a deficit
  if (surplusToGdpRatio >= 0) return 0;
  const deficitPct = -surplusToGdpRatio * 100; // positive number representing deficit %
  return Math.min(deficitPct * DEFICIT_MARGIN_BONUS_PER_PERCENT, DEFICIT_MARGIN_MAX_BONUS);
}

/**
 * Sector footprint that current logistics strength can support without a
 * sprawl penalty. Unlike a fixed corporation cap, this grows without bound as
 * the corporation invests in logistics.
 */
export function getLogisticsSupportedSectorCount(logisticsStrength?: number): number {
  const lsFraction = Math.max(0, logisticsStrength ?? 0) / LOGISTICS_MAX_SPRAWL_EFFECT;
  return Math.floor(SPRAWL_SECTOR_THRESHOLD * (1 + lsFraction));
}

/**
 * Calculate logistics strength growth per turn.
 * Unlike marketing, logistics has no diminishing returns from stored strength —
 * the 5% per-turn decay naturally limits accumulation.
 *
 * Equilibrium strengths at various budgets:
 *   $1M/day  → LS ~55   (modest sprawl reduction)
 *   $5M/day  → LS ~96   (significant)
 *   $10M/day → LS ~122  (strong)
 *   $50M/day → LS ~185  (near-maximum)
 *   $100M/day → LS ~212 (capped at 200 for sprawl effect)
 */
export function calcLogisticsGrowth(dailyBudget: number): number {
  if (dailyBudget <= 0) return 0;
  return LOGISTICS_GROWTH_SCALE * Math.log(1 + dailyBudget / LOGISTICS_BUDGET_DENOM);
}

/**
 * Apply logistics decay and growth for one turn.
 * newStrength = (1 - DECAY_RATE) × oldStrength + growth(budget)
 */
export function calcLogisticsStrengthAfterTurn(
  currentStrength: number,
  dailyBudget: number
): number {
  const afterDecay = currentStrength * (1 - LOGISTICS_DECAY_RATE);
  const growth = calcLogisticsGrowth(dailyBudget);
  return Math.max(0, afterDecay + growth);
}

/**
 * Calculate R&D score growth per turn.
 * Mirrors the marketing formula: base gain + log-scaled budget, with
 * diminishing returns on stored score.
 *   $100k → ~1.5/turn, $2M → ~3/turn, $10M → ~4/turn
 * At score 100+ the effective growth more than halves.
 */
export function calcRdGrowth(dailyBudget: number, currentScore: number): number {
  if (dailyBudget <= 0) return 0;
  const base = RD_BASE_GAIN_PER_TURN;
  const scaled = RD_BUDGET_SCALE * Math.log(1 + dailyBudget / 100_000);
  const raw = base + scaled;
  const excess = Math.max(0, currentScore - RD_DIMINISHING_THRESHOLD);
  const diminishing = RD_DIMINISHING_THRESHOLD / (RD_DIMINISHING_THRESHOLD + currentScore + excess);
  return raw * diminishing;
}

/**
 * Apply R&D decay and growth for one turn.
 * newScore = max(0, (1 - DECAY_RATE) × oldScore + growth(budget))
 */
export function calcRdScoreAfterTurn(currentScore: number, dailyBudget: number): number {
  const afterDecay = currentScore * (1 - RD_DECAY_RATE);
  const growth = calcRdGrowth(dailyBudget, currentScore);
  return Math.max(0, afterDecay + growth);
}

/**
 * Worker-morale multiplier on R&D efficiency.
 * Driven by the corp's revenue-weighted average sector `wageLevel`: 1.0 (baseline
 * pay) is neutral, paying above baseline lifts R&D output up to +{@link
 * RD_MORALE_MAX_SWING}, paying below drags it down by the same. Clamped to the
 * band. When the labour system is off, `wageLevel` defaults to 1, so this is a
 * no-op (factor 1.0) and changes nothing.
 */
export function rdMoraleFactor(avgWageLevel: number): number {
  const raw = 1 + RD_MORALE_SENSITIVITY * (avgWageLevel - 1);
  return Math.min(1 + RD_MORALE_MAX_SWING, Math.max(1 - RD_MORALE_MAX_SWING, raw));
}

/**
 * Management overhead (pp of margin, returned as a positive charge) for a
 * corporation running `plantCount` whole plants: `ppPerDoubling` for every
 * doubling above MANAGEMENT_OVERHEAD_FREE_PLANTS. Coordinating more plants
 * costs every plant a little, so the largest corporations' margins thin out
 * while ordinary ones are untouched. 0 when the knob is 0 (the default).
 */
export function managementOverheadPp(plantCount: number, ppPerDoubling: number): number {
  if (!(ppPerDoubling > 0) || !(plantCount > MANAGEMENT_OVERHEAD_FREE_PLANTS)) return 0;
  return ppPerDoubling * Math.log2(plantCount / MANAGEMENT_OVERHEAD_FREE_PLANTS);
}

/**
 * Logistical sprawl penalty: -0.5% for every 2 sectors over 15.
 * A corporation with 15 or fewer sectors has no penalty.
 * 16-17 sectors: -0.5%, 18-19: -1.0%, etc.
 *
 * Having a secondary type doubles the base penalty (-1.0% per pair),
 * representing the complexity of managing diverse operations.
 * Logistics spending can still reduce this:
 * - At LS 0: threshold 15, penalty -0.5% per pair (or -1.0% with secondary)
 * - At LS 200 (max): threshold 30 (doubled), penalty halved
 * - Linear interpolation between 0 and 200
 */
export function getSprawlModifier(
  totalSectors: number,
  logisticsStrength?: number,
  hasSecondaryType?: boolean
): number {
  const lsFraction = Math.max(0, logisticsStrength ?? 0) / LOGISTICS_MAX_SPRAWL_EFFECT;

  // Base penalty is doubled when secondary type is active
  const basePenalty = hasSecondaryType ? SPRAWL_PENALTY_PER_PAIR * 2 : SPRAWL_PENALTY_PER_PAIR;

  // Threshold scales linearly with logistics — no upper bound
  const effectiveThreshold = SPRAWL_SECTOR_THRESHOLD + SPRAWL_SECTOR_THRESHOLD * lsFraction;
  // Penalty reduction is clamped at 50% so high scores cannot invert the penalty
  const effectivePenalty = basePenalty * Math.max(0.5, 1 - 0.5 * lsFraction);

  if (totalSectors <= effectiveThreshold) return 0;
  const excess = totalSectors - effectiveThreshold;
  return Math.floor(excess / 2) * effectivePenalty;
}

/**
 * Multiplier on a corporation's shipping costs (freight bill and landed input
 * surcharge) from its logistics strength: 1 at LS 0, linear down to
 * `1 - LOGISTICS_SHIPPING_DISCOUNT_MAX` at LS 200 and flat beyond. Unlike the
 * sprawl relief this bites at every footprint size, so a corporation under
 * the sprawl threshold still gets a return on its logistics.
 */
export function getLogisticsShippingMultiplier(logisticsStrength?: number | null): number {
  const ls =
    typeof logisticsStrength === "number" && Number.isFinite(logisticsStrength)
      ? logisticsStrength
      : 0;
  const fraction = Math.min(1, Math.max(0, ls) / LOGISTICS_MAX_SPRAWL_EFFECT);
  return 1 - LOGISTICS_SHIPPING_DISCOUNT_MAX * fraction;
}

/**
 * Logistics sectors are the network that carries the sprawl, so they never pay
 * the sprawl penalty on their own margin. They still count toward the
 * corporation's sector total, so every other sector's penalty is unchanged.
 */
export function isSprawlExemptSectorType(sectorType: string): boolean {
  return sectorType === "logistics";
}

/**
 * Single source of truth for computing all margin modifiers for a sector.
 * Used by the turn processor, corporation API, and sector detail API.
 *
 * @param sectorType - The sector's corporation type
 * @param baseProfitMargin - The sector's base profit margin
 * @param metrics - Raw state metric values
 * @param commodityMod - Combined commodity modifier (input cost + surplus bonus), default 0
 * @param homeLocationBonus - From getHomeLocationMarginBonus (home state +10%, home nation +5%, international 0)
 * @returns All modifier values and the effective margin (rounded to 1 decimal)
 */
export function computeAllMarginModifiers(
  sectorType: OperatingSectorType,
  baseProfitMargin: number,
  metrics: StateMetricValues,
  commodityMod: number = 0,
  homeLocationBonus: number = 0,
  corporationType?: OperatingSectorType,
  totalSectors?: number,
  macroEcon?: MacroEconomicValues,
  logisticsStrength?: number,
  secondaryType?: OperatingSectorType | null,
  typeSwitchPenaltyActive?: boolean,
  foreignTariffMod: number = 0,
  domesticTariffMod: number = 0,
  subsidyMod: number = 0,
  strategyTransitionMod: number = 0,
  stateSectorSpecializationMod: number = 0,
  marketSharePercent: number = 0,
  negativeProductionSustainedTurns: number = 0,
  currentPolicyLevel: number = 0,
  stateMetricOverride: StateMetricMarginOverride | null = null,
  /**
   * State-owned (NatCorp) sectors are exempt from the private-firm penalties for
   * market dominance, off-type sectors, and logistical sprawl — a NatCorp is a
   * diversified state holding company that holds nationalized sectors and
   * dominates by design. Its state-run inefficiency is modelled by the dedicated
   * SOE efficiency penalty, not these.
   */
  stateOwned: boolean = false,
  regionalConditionsModifier: number = 0,
  regionalConditionModifiers: { label: string; marginEffect: number }[] = [],
  /** The sprawl margin (pp) the turn actually applied, when recorded (SOEs pay on the state's holdings). */
  sprawlMarginOverride: number | null = null,
  /**
   * The dominance penalty (pp) the turn actually applied, when recorded. It
   * already carries the plants fade, tech shield and running-cost scale that
   * the share alone cannot reproduce.
   */
  dominanceMarginOverride: number | null = null
): MarginModifiers {
  const unemploymentMod = getUnemploymentMarginModifier(metrics.unemploymentRate);
  const gridMod = getGridReliabilityMarginModifier(metrics.gridReliability);
  const corruptionMod = getCorruptionMarginModifier(metrics.corruptionIndex);

  const workforceSkillApplies = WORKFORCE_SKILL_SECTORS.has(sectorType);
  const crimeRateApplies = CRIME_RATE_SECTORS.has(sectorType);
  const broadbandApplies = BROADBAND_SECTORS.has(sectorType);
  const roadConditionApplies = ROAD_CONDITION_SECTORS.has(sectorType);
  const carbonEmissionsApplies = CARBON_EMISSIONS_SECTORS.has(sectorType);
  const costOfLivingApplies = COST_OF_LIVING_SECTORS.has(sectorType);

  const workforceSkillMod = workforceSkillApplies
    ? getWorkforceSkillMarginModifier(metrics.workforceSkill)
    : 0;
  const crimeRateMod = crimeRateApplies ? getCrimeRateMarginModifier(metrics.crimeRate) : 0;
  const broadbandMod = broadbandApplies ? getBroadbandMarginModifier(metrics.broadbandAccess) : 0;
  const roadConditionMod = roadConditionApplies
    ? getRoadConditionMarginModifier(metrics.roadCondition)
    : 0;
  const carbonEmissionsMod = carbonEmissionsApplies
    ? getCarbonEmissionsMarginModifier(metrics.carbonEmissions)
    : 0;
  const costOfLivingMod = costOfLivingApplies
    ? getCostOfLivingMarginModifier(metrics.costOfLiving)
    : 0;
  const legacyStateMetricTotal =
    unemploymentMod +
    gridMod +
    corruptionMod +
    workforceSkillMod +
    crimeRateMod +
    broadbandMod +
    roadConditionMod +
    carbonEmissionsMod +
    costOfLivingMod;
  const stateMetricTotal = stateMetricOverride?.total ?? legacyStateMetricTotal;
  const headline = stateMetricOverride?.headlineModifiers;

  const sectorTypeMatchMod =
    stateOwned || !corporationType
      ? 0
      : getSectorTypeMatchModifier(sectorType, corporationType, secondaryType);
  const sprawlMod =
    sprawlMarginOverride != null
      ? sprawlMarginOverride
      : stateOwned || totalSectors == null || isSprawlExemptSectorType(sectorType)
        ? 0
        : getSprawlModifier(totalSectors, logisticsStrength, !!secondaryType);

  // National-level macroeconomic modifiers
  const inflationMod = macroEcon ? getInflationMarginModifier(macroEcon.inflationRate) : 0;
  const debtToGdpMod = macroEcon ? getDebtToGdpMarginModifier(macroEcon.debtToGdpRatio) : 0;
  const deficitToGdpMod = macroEcon
    ? getDeficitToGdpMarginModifier(macroEcon.surplusToGdpRatio)
    : 0;

  const typeSwitchMod = typeSwitchPenaltyActive ? TYPE_SWITCH_MARGIN_PENALTY : 0;
  const dominanceMarginMod = stateOwned
    ? 0
    : (dominanceMarginOverride ?? getDominanceMarginPenalty(marketSharePercent));
  // Regulatory burden is deducted from revenue (not margin) by the sector loop.
  // We surface its margin-point equivalent here so the UI breakdown can show
  // the full cost of dominance in one place. NOT included in `totalMod` to
  // avoid double-counting — the sector loop subtracts the burden from revenue
  // directly, which is mathematically equivalent to a margin-pp deduction.
  const dominanceRegBurdenPp = stateOwned
    ? 0
    : -100 * getDominanceRegulatoryBurden(marketSharePercent);
  const negProductionMod = getSustainedNegativeProductionPenalty(
    negativeProductionSustainedTurns,
    currentPolicyLevel
  );

  const totalMod =
    stateMetricTotal +
    commodityMod +
    homeLocationBonus +
    stateSectorSpecializationMod +
    sectorTypeMatchMod +
    sprawlMod +
    inflationMod +
    debtToGdpMod +
    deficitToGdpMod +
    typeSwitchMod +
    foreignTariffMod +
    domesticTariffMod +
    subsidyMod +
    strategyTransitionMod +
    dominanceMarginMod +
    negProductionMod +
    regionalConditionsModifier;

  // Margin can go negative — sectors in terrible commodity markets drain cash.
  // Soft-capped on the high side to match the turn engine (softCapEffectiveMargin).
  const effective = softCapEffectiveMargin(baseProfitMargin + totalMod);

  const r = (v: number) => Math.round(v * 10) / 10;

  return {
    unemploymentModifier: r(headline?.unemploymentModifier ?? unemploymentMod),
    gridReliabilityModifier: r(headline?.gridReliabilityModifier ?? gridMod),
    corruptionModifier: r(headline?.corruptionModifier ?? corruptionMod),
    workforceSkillModifier:
      headline?.workforceSkillModifier !== undefined
        ? headline.workforceSkillModifier
        : workforceSkillApplies
          ? r(workforceSkillMod)
          : null,
    crimeRateModifier:
      headline?.crimeRateModifier !== undefined
        ? headline.crimeRateModifier
        : crimeRateApplies
          ? r(crimeRateMod)
          : null,
    broadbandModifier:
      headline?.broadbandModifier !== undefined
        ? headline.broadbandModifier
        : broadbandApplies
          ? r(broadbandMod)
          : null,
    roadConditionModifier:
      headline?.roadConditionModifier !== undefined
        ? headline.roadConditionModifier
        : roadConditionApplies
          ? r(roadConditionMod)
          : null,
    carbonEmissionsModifier:
      headline?.carbonEmissionsModifier !== undefined
        ? headline.carbonEmissionsModifier
        : carbonEmissionsApplies
          ? r(carbonEmissionsMod)
          : null,
    costOfLivingModifier:
      headline?.costOfLivingModifier !== undefined
        ? headline.costOfLivingModifier
        : costOfLivingApplies
          ? r(costOfLivingMod)
          : null,
    commodityModifier: r(commodityMod),
    homeLocationModifier: r(homeLocationBonus),
    stateSectorSpecializationModifier: r(stateSectorSpecializationMod),
    sectorTypeMatchModifier: r(sectorTypeMatchMod),
    sprawlModifier: r(sprawlMod),
    inflationModifier: r(inflationMod),
    debtToGdpModifier: r(debtToGdpMod),
    deficitToGdpModifier: r(deficitToGdpMod),
    typeSwitchModifier: r(typeSwitchMod),
    strategyTransitionModifier: r(strategyTransitionMod),
    foreignTariffModifier: r(foreignTariffMod),
    domesticTariffMalus: r(domesticTariffMod),
    subsidyModifier: r(subsidyMod),
    dominanceMarginPenalty: r(dominanceMarginMod),
    dominanceRegulatoryBurdenPp: r(dominanceRegBurdenPp),
    sustainedNegativeProductionPenalty: r(negProductionMod),
    stateMetricsModifier: r(stateMetricTotal),
    legacyStateMetricsModifier: stateMetricOverride
      ? r(stateMetricOverride.legacyTotal ?? legacyStateMetricTotal)
      : undefined,
    stateMetricContributions: stateMetricOverride?.contributions,
    regionalConditionsModifier: r(regionalConditionsModifier),
    regionalConditionModifiers: regionalConditionModifiers.map((m) => ({
      label: m.label,
      marginEffect: r(m.marginEffect),
    })),
    effective: r(effective),
  };
}

/** Canonical policies cover their operating lanes. */
export function sectorPolicyTargetMatches(
  target: string | null | undefined,
  operatingSectorType: string
): boolean {
  if (!target) return false;
  return (
    target === operatingSectorType ||
    (target === "manufacturing" && operatingSectorType === "manufacturing_vehicles") ||
    (target === "media" && operatingSectorType === "media_entertainment")
  );
}
