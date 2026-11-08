import type { CountryId } from "@/lib/constants/countries";
import {
  OPERATING_SECTOR_TYPES,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";

/**
 * Full per-sector SOE stack for Eastern-bloc / USSR command economies (ticket
 * #1014). Under plants every sector needs state capacity — a 4–8 "commanding
 * heights" subset left the rest as unreachable unowned headroom (private
 * founding is banned). One SOE corporation per {@link OPERATING_SECTOR_TYPES} lane.
 */
const EASTERN_BLOC_ALL_SECTORS_SOE: OperatingSectorType[] = [...OPERATING_SECTOR_TYPES];

/**
 * Command-economy regime model.
 *
 * Command-era economies are quantity-planned shortage economies (fixed
 * non-convertible currency, administered prices, passive monobank, soft budget
 * constraints, two-circuit money, repressed second economy), not floating
 * market currencies. Modeling them as market economies is the wrong kind of
 * economy.
 *
 * The regime is a dial, `marketizationLevel` (0 fully command, 100 fully market).
 * Subsystems activate on threshold bands:
 *
 *   level < COMMAND_CEILING      -> FULLY COMMAND
 *   COMMAND_CEILING..DUAL_TRACK  -> DUAL-TRACK (plan and market run in parallel,
 *                                   output split by `plannedShare`)
 *   level >= DUAL_TRACK_CEILING  -> MARKET (standard engine)
 *
 * Everything is gated behind the `commandEconomyEnabled` flag (default off), so
 * existing worlds are byte-identical until an operator opts in.
 */

/** Fully-market marketization level (dial at 100). */
export const MARKET_LEVEL = 100;
/** Below this the economy is fully command (all planned subsystems active). */
export const COMMAND_CEILING = 30;
/** Below this (and >= COMMAND_CEILING) the economy is dual-track. */
export const DUAL_TRACK_CEILING = 70;

export { MARKETIZATION_SCHEDULE } from "@/lib/constants/marketizationSchedule";
export type { MarketizationStep } from "@/lib/constants/marketizationSchedule";

/**
 * Back-compat view of the command band as a per-country {throughYear}. Retained
 * for readability/tests; the schedule above is the source of truth.
 */
export const COMMAND_ECONOMY_REGIMES: Partial<Record<CountryId, { throughYear: number }>> = {
  RU: { throughYear: 1991 },
  CN: { throughYear: 1978 },
};

/**
 * Planned economies whose TRADE is nevertheless open to the market world.
 *
 * Yugoslavia: expelled from the Cominform in June 1948 and embargoed by the
 * bloc, it reoriented toward Western trade, credits, and aid years before the
 * era worlds begin (1953) while keeping a planned domestic economy. Curtaining
 * it walls it in with the exact countries that were embargoing it and cuts it
 * off from its real trading partners. Domestic planned machinery (administered
 * prices, SOEs, overhang) still applies through `isPlannedEconomy`; only the
 * curtain membership is exempted. Note the wall is absolute both ways, so the
 * exemption also severs YU from the Comecon book, which matches the 1948-55
 * bloc embargo years the era opens in.
 */
export const CURTAIN_EXEMPT_COUNTRIES: ReadonlySet<string> = new Set(["YU"]);

// ── Command Economy v2 (P0): multiple SOEs + endogenous marketization drift ──

/**
 * Sectors the state operates as SEPARATE SOEs (one enterprise per sector) for a
 * command country. Country/era-tunable: only countries listed here get the
 * multi-SOE split when `commandEconomyEnabled` is on; everyone else is untouched.
 *
 * Eastern bloc / YU: full `OperatingSectorType` stack (plants in every sector).
 * CN keeps a shorter dual-track set. Maps design labels onto engine types —
 * heavy industry→manufacturing, consumer goods→retail, chemicals→chemical_industries,
 * transport→logistics.
 */
export const COMMAND_ECONOMY_SOE_SECTORS: Partial<Record<CountryId, OperatingSectorType[]>> = {
  // Full sector stack for USSR, union republics, Warsaw Pact, and Yugoslavia,
  // so plants market tiers don't leave most plants missing.
  RU: EASTERN_BLOC_ALL_SECTORS_SOE,
  UKR: EASTERN_BLOC_ALL_SECTORS_SOE,
  BLR: EASTERN_BLOC_ALL_SECTORS_SOE,
  BAL: EASTERN_BLOC_ALL_SECTORS_SOE,
  DD: EASTERN_BLOC_ALL_SECTORS_SOE,
  // Germany carries no planned band in the SCHEDULE (market by seed), but a
  // German Question `challenger` outcome carries the GDR's regime onto it
  // (`mergeEconomicRegime`). This entry is INERT until that stored dial puts DE
  // in the command band — every consumer gates on `isCommandEconomy` /
  // `isPlannedEconomy` first — and exists so a reunified socialist Germany has
  // an SOE stack to operate rather than a planned economy with no plan.
  DE: EASTERN_BLOC_ALL_SECTORS_SOE,
  PL: EASTERN_BLOC_ALL_SECTORS_SOE,
  HU: EASTERN_BLOC_ALL_SECTORS_SOE,
  CS: EASTERN_BLOC_ALL_SECTORS_SOE,
  BG: EASTERN_BLOC_ALL_SECTORS_SOE,
  RO: EASTERN_BLOC_ALL_SECTORS_SOE,
  YU: EASTERN_BLOC_ALL_SECTORS_SOE,
  // China keeps a shorter dual-track-aware set — it migrates toward market and
  // is not an Eastern-bloc satellite in this model.
  CN: ["manufacturing", "energy", "extraction", "agriculture", "retail", "chemical_industries"],
};

/**
 * Per-turn drift weights for the endogenous-marketization formula. The phase
 * runs EVERY turn (48/yr), so these are deliberately small: a starved world
 * (high black-market pressure + failing SOEs) drifts up by ~+0.3/turn (~+15/yr)
 * and reforms out of the command band over a few in-game years, while a
 * well-run orthodox world sits at a slightly-negative drift and holds at the
 * command floor. Tuned to avoid both a death spiral and a frozen dial; final
 * balance pass is P3.
 *
 *   Δlevel = w_bm  * blackMarketPressure           // shortages/grey market → +
 *          + w_soe * (SOE_PERF_BASELINE - soePerf) // weak SOEs → +, strong → −
 *          + w_pol * policyStance                  // reformist → +, orthodox → −
 */
export const MARKETIZATION_DRIFT_WEIGHTS = {
  /**
   * Weight on black-market pressure (0..1). Max +0.22/turn. Tuned so the
   * shortage→black-market reform spiral moves the dial without overshooting:
   * `accumulateOverhang` counts unmet plan as a goods deficit, and a
   * competently-run, orthodox, hands-off USSR crosses COMMAND_CEILING in 1984
   * on higher weights. At 0.22 it stays COMMAND through 1991.
   *
   * Mismanagement and collapse paths are dominated by the soePerformance and
   * policyStance terms, so this trim leaves them nearly untouched.
   */
  blackMarket: 0.22,
  /** Weight on the SOE plan-fulfillment shortfall (baseline − perf). Kept low
   *  so chronic plan misses stay the primary reform channel without a
   *  collapsed world rocketing to fully-market in a few years. */
  soePerformance: 0.18,
  /** Weight on the signed reform-vs-orthodox policy stance (−1..+1). P3: nudged
   *  from 0.10 now that government reformism is wired live end-to-end (a
   *  reformist elected majority should visibly move marketization). */
  policyStance: 0.12,
} as const;

export type MarketizationDriftWeights = typeof MARKETIZATION_DRIFT_WEIGHTS;

/**
 * Per-turn restoring pull, in level-points per point of gap, toward the era
 * SCHEDULE. See {@link marketizationGravity}.
 */
export const MARKETIZATION_GRAVITY_RATE = 0.004;
/**
 * Hard cap on the magnitude of the gravity term per turn (≈ ±0.96 level-points
 * per 48-turn year). Deliberately of the SAME order as the free drivers, never
 * larger — gravity must lose to a determined government.
 */
export const MARKETIZATION_GRAVITY_MAX_STEP = 0.02;

// ── Command Economy v2 (P1): active-Gosbank defaults + real policy stance ────

/**
 * NPP-brain Gosbank defaults, used when a planned country has no derived
 * `commandStance` yet and no P2 player directive. Deliberately "orthodox-
 * competent": fairly SOFT budgets (historical planned-economy behaviour) and a
 * moderate credit posture. P2 player panels override per country via
 * `economicFactors.gosbankDirective`; the NPP government brain overrides via
 * `governmentFormations.commandStance`.
 */
export const NPP_DEFAULT_CREDIT_AGGRESSIVENESS = 0.55;
export const NPP_DEFAULT_BUDGET_SOFTNESS = 0.85;
export const NPP_DEFAULT_REFORMISM = 0;
/** NPP-brain / last-resort internal-repression default when no per-country stance
 *  or player directive exists — a MODERATE dial (an orthodox regime with no
 *  reform lean neither fully represses nor fully tolerates the second economy). */
export const NPP_DEFAULT_INTERNAL_REPRESSION = 0.5;

/** Softness at/above which an insolvent SOE is SPARED (soft budget); below it the
 *  SOE is allowed to fold (hard budget → efficiency pressure → reform). */
export const BUDGET_SOFTNESS_FOLD_THRESHOLD = 0.5;

/**
 * Weight on the ruling party's CHARTERED economic line in the government-
 * reformism blend (see {@link blendGovernmentReformism}).
 */
export const REFORMISM_PARTY_WEIGHT = 0.5;
/**
 * Weight on the SITTING government's live command stance in the government-
 * reformism blend (see {@link blendGovernmentReformism}).
 */
export const REFORMISM_CABINET_WEIGHT = 0.5;

/** Weight on the GOVERNMENT's reformism in the policy-stance blend. */
export const POLICY_GOV_WEIGHT = 0.6;
/** Weight on the GOSBANK posture (credit + softness) in the policy-stance blend. */
export const POLICY_GOSBANK_WEIGHT = 0.4;
