/**
 * Market consequences of central-bank credibility: sovereign spread, FX
 * target adherence, and deposit flight.
 *
 * Every function here honors three invariants:
 *
 *  - No inflation feedback: nothing here feeds the inflation term. The
 *    expectations dampener is the only credibility-to-inflation channel; a
 *    second would close the death-spiral loop.
 *  - Bounded and floored: a maximally discredited bank still has a
 *    functioning market. Ruin is expensive, not terminal.
 *  - Zero at full credibility: at scrutiny 0 every multiplier is 1 and every
 *    delta is 0, so a clean bank sees no change.
 *
 * Pure math only. Wiring lives at the call sites.
 */

import { credibilityFromScrutiny } from "@/lib/centralBank/credibility";

/**
 * Extra percentage points on the sovereign coupon at MAXIMUM scrutiny.
 *
 * Sized against the existing yield curve rather than against real-world crisis
 * spreads: the 5yr term premium is 0.75pp, so 1.5pp makes total loss of
 * credibility cost about twice what the longest maturity costs. That is a
 * genuine budget line on a large debt stock without being the kind of number
 * that pushes a country into sovereign default on its own, which would be an
 * inflation-adjacent spiral by another route.
 */
export const SOVEREIGN_CREDIBILITY_SPREAD_MAX_PP = 1.5;

/**
 * Share of an intervention's market effect that survives at MAXIMUM scrutiny.
 *
 * Mirrors `TRANSMISSION_FLOOR` (0.6) in spirit but sits higher, at 0.7. An
 * intervention is a real reserve outlay, not a statement, so a discredited bank
 * loses less of it than it loses of pure jawboning. The reserve cost is
 * unchanged: what falls is what the spend buys, which is the correct shape for
 * "the market doubts you will hold the line".
 */
export const FX_ADHERENCE_FLOOR = 0.7;

/**
 * Share of NPC household deposits domestic banks still capture at MAXIMUM
 * scrutiny.
 *
 * The highest floor of the three, at 0.8. Deposit flight is sticky in reality
 * (accounts, wages and prices are all denominated at home) and the flagged
 * private-banking system is young, so a fifth of capturable deposits walking is
 * already a visible dent in bank funding without threatening solvency across
 * the board.
 */
export const DEPOSIT_RETENTION_FLOOR = 0.8;

/**
 * Percentage points added to a sovereign bond coupon by lost credibility.
 * 0 at full credibility, {@link SOVEREIGN_CREDIBILITY_SPREAD_MAX_PP} at zero.
 *
 * Linear on purpose: this is a spread investors demand, and a convex curve here
 * would make the last few points of scrutiny catastrophic, which is exactly the
 * cliff the whole B4 design is trying not to build.
 */
export function sovereignCredibilitySpread(scrutiny: number): number {
  const credibility = credibilityFromScrutiny(scrutiny);
  return SOVEREIGN_CREDIBILITY_SPREAD_MAX_PP * (1 - credibility);
}

/**
 * Multiplier on the market effect an FX intervention achieves, NOT on what it
 * costs. 1 at full credibility, {@link FX_ADHERENCE_FLOOR} at zero.
 */
export function interventionAdherenceMultiplier(scrutiny: number): number {
  return FX_ADHERENCE_FLOOR + (1 - FX_ADHERENCE_FLOOR) * credibilityFromScrutiny(scrutiny);
}

/**
 * Multiplier on the share of NPC household deposits domestic banks capture.
 * 1 at full credibility, {@link DEPOSIT_RETENTION_FLOOR} at zero. The remainder
 * is not destroyed, it simply stays outside the domestic banks as foreign
 * currency holdings, so the money-supply books still balance.
 */
export function domesticDepositRetention(scrutiny: number): number {
  return (
    DEPOSIT_RETENTION_FLOOR + (1 - DEPOSIT_RETENTION_FLOOR) * credibilityFromScrutiny(scrutiny)
  );
}
