/**
 * Command-economy macro-state kernels.
 *
 * Pure, deterministic, NaN-guarded math for planned-economy readouts on
 * `FederalBudget.economicFactors`. `commandEconomyTurn` handles I/O.
 *
 * Shortage-economy model: a quantity-planned economy runs chronic shortage
 * (Kornai); sticky prices don't clear, so excess nominal income piles up as a
 * MONETARY OVERHANG that drives a SHORTAGE INDEX. Repressed demand spills into
 * a black-market SECOND ECONOMY that clears at a premium and relieves the
 * overhang (Grossman).
 *
 * CADENCE: the phase runs every turn (48/year) but growth signals are ANNUAL
 * percentages, so flows are divided by TURNS_PER_YEAR and decay is a gentle
 * per-turn rate (forced savings are sticky).
 */

import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { OVERHANG_CAP } from "./rules";
export { countryPhysicalDemandSupplyGapPct, OVERHANG_CAP, shortageIndexFrom } from "./rules";

const clamp = (v: number, lo: number, hi: number): number =>
  !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));

/** Per-turn persistence of accumulated overhang absent new flow. 0.99/turn ≈ a
 *  ~2-year decay horizon (48 turns/yr) — forced savings bleed off slowly. */
const OVERHANG_DECAY = 0.99;
/**
 * Converts an unmet plan (1 - fulfillment) into an annual percentage-point
 * deficit on the GOODS side of the overhang gap.
 *
 * In a shortage economy, forced savings come from the gap between incomes the
 * plan pays out and consumer goods that reach the shelves. Without this term
 * the sign can invert: if wageGrowth and gdpGrowth are close, a missed plan
 * produces no overhang at all, so the model reports zero shortage pressure
 * no matter how badly enterprises perform.
 *
 * 20 maps a 16% plan miss to ~3.2pp of annual goods deficit.
 */
const PLAN_SHORTFALL_GOODS_DEFICIT = 20;
/** Max black-market premium as a fraction over official (2.0 = +200%). */
export const MAX_BLACK_MARKET_PREMIUM = 2.0;
/** Ceiling on how much of the economy can flee into the second economy. */
export const MAX_SECOND_ECONOMY_SHARE = 0.6;
/** How quickly the second-economy share tracks its target each turn. */
const SECOND_ECONOMY_ADJUST = 0.25;

/**
 * Accumulate the monetary overhang. Overhang grows when nominal wages outrun
 * real goods availability, scaled by `plannedShare`; it decays as excess is
 * spent and as the second economy absorbs it. Bounded to [0, OVERHANG_CAP].
 *
 * @param creditInjection per-turn overhang-index points from monetized credit;
 *        already a per-turn flow, added after the /TURNS_PER_YEAR conversion.
 * @param planFulfillment aggregate SOE plan fulfillment (1.0 = on plan). The
 *        unmet part widens the goods-side gap. Default 1.0 adds no term.
 */
export function accumulateOverhang(
  prevOverhang: number,
  wageGrowth: number,
  realGoodsGrowth: number,
  plannedShare: number,
  secondEconomyRelief = 0,
  creditInjection = 0,
  planFulfillment = 1
): number {
  const prev = clamp(prevOverhang, 0, OVERHANG_CAP);
  const share = clamp(plannedShare, 0, 1);
  // The unmet plan, as an annual pp deficit on the goods side. Only a SHORTFALL
  // counts: an over-delivering plan does not conjure negative overhang, it just
  // stops contributing (the wage/GDP term alone decides from there).
  const shortfall = Number.isFinite(planFulfillment) ? Math.max(0, 1 - planFulfillment) : 0;
  const goodsDeficit = shortfall * PLAN_SHORTFALL_GOODS_DEFICIT;
  // Forced-saving flow: only the excess of nominal income over real goods, and
  // only the administered fraction of it, becomes overhang. In percentage points.
  const gap =
    Number.isFinite(wageGrowth) && Number.isFinite(realGoodsGrowth)
      ? wageGrowth - realGoodsGrowth + goodsDeficit
      : goodsDeficit;
  // Annual pp gap → per-turn flow. Without the /TURNS_PER_YEAR the annual rate
  // would be re-applied all 48 turns of the year and overhang would explode.
  const flow = (share * Math.max(0, gap)) / TURNS_PER_YEAR;
  const injection = Number.isFinite(creditInjection) ? Math.max(0, creditInjection) : 0;
  const relief = clamp(secondEconomyRelief, 0, OVERHANG_CAP);
  return clamp(prev * OVERHANG_DECAY + flow + injection - relief, 0, OVERHANG_CAP);
}

/** Scales monetized directed-credit issuance into overhang-index points per turn.
 *  Chosen so a heavy-credit turn adds a few points; P3-tunable. */
const CREDIT_OVERHANG_SCALE = 1.0;

/**
 * Convert this turn's monetized directed-credit issuance into the per-turn
 * overhang-index injection fed to {@link accumulateOverhang}. The injection is
 * the issuance measured against the size of the planned economy (aggregate plan
 * output) and scaled by how much of the economy is administered — printed money
 * only piles up as forced savings inside the plan. Bounded, NaN-guarded.
 *
 * @param monetizedIssuance credit not covered by savings (currency units)
 * @param planBase          aggregate plan output the issuance is measured against
 * @param plannedShare      0..1 administered share of the economy
 */
export function overhangInjectionFromIssuance(
  monetizedIssuance: number,
  planBase: number,
  plannedShare: number
): number {
  const issuance =
    Number.isFinite(monetizedIssuance) && monetizedIssuance > 0 ? monetizedIssuance : 0;
  const base = Number.isFinite(planBase) && planBase > 0 ? planBase : 0;
  if (base === 0) return 0;
  const share = clamp(plannedShare, 0, 1);
  const frac = issuance / base; // dimensionless share of plan output printed
  return clamp(CREDIT_OVERHANG_SCALE * frac * 100 * share, 0, OVERHANG_CAP);
}

/**
 * Black-market premium (fraction over official). Rises with the shortage index
 * and, more mildly, the overhang; a more TOLERANT regime lets the second economy
 * clear more of the excess, damping the premium. Bounded [0, MAX_BLACK_MARKET_PREMIUM].
 *
 * @param shortageIndex 0..100
 * @param overhang      0..OVERHANG_CAP
 * @param tolerance     0 (full repression) .. 1 (tolerated) second-economy lever
 */
export function blackMarketPremiumFrom(
  shortageIndex: number,
  overhang: number,
  tolerance = 0.3
): number {
  const s = clamp(shortageIndex, 0, 100) / 100;
  const o = clamp(overhang, 0, OVERHANG_CAP) / OVERHANG_CAP;
  const tol = clamp(tolerance, 0, 1);
  // Base premium from scarcity + a smaller overhang kicker; tolerance relieves
  // up to ~40% of it (a functioning grey market narrows the official/shadow gap).
  const raw = (0.8 * s + 0.2 * o) * MAX_BLACK_MARKET_PREMIUM;
  return clamp(raw * (1 - 0.4 * tol), 0, MAX_BLACK_MARKET_PREMIUM);
}

/**
 * Update the second-economy share and report the overhang it relieves this turn.
 * The share tracks a target that grows with shortage and with how far the state
 * tolerates informal activity; a repressive regime keeps it small (so pressure
 * stays bottled as overhang/premium), a tolerant one lets it grow and absorb.
 *
 * @returns { share, relief } — new share [0, MAX_SECOND_ECONOMY_SHARE] and the
 *          overhang-index points it soaks up this turn.
 */
export function updateSecondEconomy(
  prevShare: number,
  shortageIndex: number,
  overhang: number,
  tolerance = 0.3
): { share: number; relief: number } {
  const prev = clamp(prevShare, 0, MAX_SECOND_ECONOMY_SHARE);
  const s = clamp(shortageIndex, 0, 100) / 100;
  const tol = clamp(tolerance, 0, 1);
  const target = clamp(s * (0.2 + 0.6 * tol), 0, MAX_SECOND_ECONOMY_SHARE);
  const share = clamp(prev + (target - prev) * SECOND_ECONOMY_ADJUST, 0, MAX_SECOND_ECONOMY_SHARE);
  // The grey market drains overhang in proportion to its size and tolerance.
  const relief = clamp(share * tol * 0.5 * clamp(overhang, 0, OVERHANG_CAP), 0, OVERHANG_CAP);
  return { share, relief };
}

/**
 * How far full internal repression (level 1) can force down the black-market
 * EXPRESSION terms of the pressure blend (the shadow premium + the grey-market
 * share). At 0.8 a fully repressive regime cuts those two contributions by 80%.
 * The SHORTAGE term is deliberately untouched — repression hides the black
 * market, it does not conjure the missing goods (see the module header and the
 * design note in `internalRepression` on `economicFactors`).
 */
const REPRESSION_EXPRESSION_SUPPRESSION = 0.8;

/**
 * Collapse the shortage-economy readouts into a 0..1 BLACK-MARKET PRESSURE
 * scalar, the `blackMarketPressure` driver of endogenous-marketization drift.
 * Each input is normalised to 0..1 against its own ceiling and blended
 * (scarcity dominates; premium and grey-market size confirm).
 *
 * Repression scales ONLY the premium and second-economy terms, never the
 * shortage term (the underlying cause). Repression hides the symptom, it does
 * not fix the plan. `repression = 0` (default) matches the pre-repression blend.
 *
 * @param shortageIndex      0..100 goods scarcity at administered prices
 * @param blackMarketPremium 0..MAX_BLACK_MARKET_PREMIUM shadow premium (fraction)
 * @param secondEconomyShare 0..MAX_SECOND_ECONOMY_SHARE informal-economy share
 * @param repression         0 (none) .. 1 (heavy) internal-repression lever
 */
export function blackMarketPressure(
  shortageIndex: number,
  blackMarketPremium: number,
  secondEconomyShare: number,
  repression = 0
): number {
  const s = clamp(shortageIndex, 0, 100) / 100;
  const p = clamp(blackMarketPremium, 0, MAX_BLACK_MARKET_PREMIUM) / MAX_BLACK_MARKET_PREMIUM;
  const e = clamp(secondEconomyShare, 0, MAX_SECOND_ECONOMY_SHARE) / MAX_SECOND_ECONOMY_SHARE;
  const rep = clamp(repression, 0, 1);
  // Repression forces down the black-market EXPRESSION (premium + grey market),
  // never the shortage that produced it.
  const expressionScale = 1 - REPRESSION_EXPRESSION_SUPPRESSION * rep;
  return clamp(0.5 * s + (0.3 * p + 0.2 * e) * expressionScale, 0, 1);
}

/** Per-turn ceiling on the popular-legitimacy cost of internal repression. Sits
 *  alongside the purge-cost band in `popularLegitimacyDrivers` (an extreme purge
 *  is -1.0); sustained heavy repression amid acute shortage is comparably
 *  corrosive but bounded so no single turn is fatal on its own. */
export const MAX_REPRESSION_LEGITIMACY_COST = 1.0;

/**
 * The per-turn popular-legitimacy COST of internal repression, returned as a
 * signed delta in [-MAX_REPRESSION_LEGITIMACY_COST, 0].
 *
 * Repression is not free: forcing the second economy down burns regime
 * legitimacy, and the cost climbs with BOTH how hard the state represses AND how
 * severe the still-unfixed shortage is — repressing amid empty shelves is a
 * pressure cooker. The cost is the product of the two (each normalised 0..1), so
 * light repression in a well-supplied economy is nearly free while heavy
 * repression atop acute shortage approaches the cap. Pure, bounded, NaN-guarded.
 *
 * @param repression    0 (none) .. 1 (heavy) internal-repression lever
 * @param shortageIndex 0..100 goods scarcity (the still-present cause)
 */
export function repressionLegitimacyCost(repression: number, shortageIndex: number): number {
  const rep = clamp(repression, 0, 1);
  const s = clamp(shortageIndex, 0, 100) / 100;
  const cost = clamp(rep * s * MAX_REPRESSION_LEGITIMACY_COST, 0, MAX_REPRESSION_LEGITIMACY_COST);
  // Normalise the zero case to +0 (avoid signed -0 leaking into readouts / tests).
  return cost === 0 ? 0 : -cost;
}
