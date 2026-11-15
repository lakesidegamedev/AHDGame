import { COLD_CAPACITY_UPKEEP_FRACTION } from "@/lib/corporations/investment/rules";
import { OPERATING_SECTOR_TYPES, type OperatingSectorType } from "./corporations";
import { MODERN_ERA_START_YEAR } from "./monetaryEra";

/**
 * Revenue per worker used by `calculateWorkers`. That constant is module-private
 * in `corporations.ts` (and owned by another agent this phase, so it is not
 * being exported there). It is re-stated here as the single place identity A
 * reads it from; `capacityEconomy.test.ts` pins it against the live behavior of
 * `calculateWorkers` so the two can never silently diverge.
 */
export const CAPACITY_REVENUE_PER_WORKER = 2_000;

/** The era whose anchors are the exact calibration point (era columns = 1.0). */
export const CAPACITY_ANCHOR_YEAR = 1953;

/**
 * The strategy id every sector's baseline (ungated, non-tech-tree) operating
 * method carries. `getStrategy` and every read site in the codebase default to
 * it (`sector.strategyId ?? "standard"`).
 */
export const DEFAULT_STRATEGY_ID = "standard";

// ─── Era columns ────────────────────────────────────────────────────────────

/**
 * PROVISIONAL era price column, normalized so the 1953 anchor is exactly 1.0.
 *
 * No LABOUR table: labour is derived live by {@link capacityEraLaborIndex}
 * from `eraLaborMultiplier` in `lib/labour/laborCost.ts`, renormalized to 1.0
 * at 1953. Reusing that curve keeps capacity staffing consistent with the
 * labour-cost model instead of asserting a second, conflicting history. Its
 * tier years (2007, 1991, 1953) intentionally do not align with the price
 * spans below; they are different claims.
 *
 * `priceIndex` is a nominal price-level index (a 1953 ₳ builds more than a
 * 1999 ₳). FLAGGED PROVISIONAL: worldsim will re-tune this column.
 */
export const CAPACITY_ERA_PRICE_ANCHORS: ReadonlyArray<{ year: number; priceIndex: number }> = [
  { year: CAPACITY_ANCHOR_YEAR, priceIndex: 1.0 },
  { year: 1971, priceIndex: 1.4 },
  { year: 1979, priceIndex: 2.6 },
  { year: 1991, priceIndex: 3.6 },
  { year: MODERN_ERA_START_YEAR, priceIndex: 5.0 },
];

/** Modern calibration and missing-year fallback. PROVISIONAL. */
export const CAPACITY_ERA_MODERN_PRICE_INDEX = 5.0;

// ─── Construction time ──────────────────────────────────────────────────────

/**
 * Authored base construction times, in turns. investmentBuildTurns applies the
 * ordinary heavy-build reduction while preserving founding durations.
 *
 * Authored, not derived: the legacy growth path delivers capacity with no
 * build lag to calibrate against. Shape only: heavy, sited, permit-bound
 * industry is slow; asset-light retail and services are fast. Scale: 24 turns
 * = one financial day, 48 turns = one game year, so 96 turns ~ two game years
 * for a refinery-class build.
 *
 * FLAGGED PROVISIONAL: worldsim re-tunes this whole table.
 */
export const CAPACITY_BUILD_TURNS_TABLE: Record<OperatingSectorType, number> = {
  // Heavy / sited / permit-bound.
  energy: 96,
  extraction: 96,
  chemical_industries: 84,
  manufacturing: 72,
  manufacturing_vehicles: 72,
  defense: 72,
  telecommunications: 60,
  real_estate: 60,
  construction: 48,
  healthcare: 48,
  agriculture: 48,
  // Trucks and depots, not a refinery. At 36 turns a freight shortage after a
  // reset ran a game day and a half before any new fleet could help.
  logistics: 15,
  media_entertainment: 24,
  media: 24,
  financial: 24,
  technology: 24,
  // Asset-light: a store fit-out is weeks, not years.
  retail: 12,
};

/** Fallback for an unrecognized sector type (mid-table). */
export const CAPACITY_BUILD_TURNS_DEFAULT = 48;

/** Every sector type, for exhaustive iteration in tests and tooling. */
export const CAPACITY_SECTOR_TYPES: ReadonlyArray<OperatingSectorType> = OPERATING_SECTOR_TYPES;

// ─── P3a: build orders, mothballing, idle upkeep ────────────────────────────

/*
 * Share of a cancelled build order's paid cost that is refunded.
 * Deliberately not 1.0: a cancelled order has already consumed siting,
 * permitting, engineering and part of the build, and a full refund would make
 * the queue a free option. 0.75 leaves a real but non-punitive cost to changing
 * your mind.
 */
export const CAPACITY_BUILD_CANCEL_REFUND = 0.75;

/**
 * Upkeep on parked capacity, as a fraction of its anchored maintenance basis.
 * A mothballed plant produces and offers nothing. Its owned capacity and paid
 * basis remain, with normal depreciation and reduced maintenance costs.
 */
export const MOTHBALL_UPKEEP_FRACTION = COLD_CAPACITY_UPKEEP_FRACTION;

/**
 * Share of the pro-rata maintenance cost that IDLE (built but unused) capacity
 * still carries under plants.
 *
 * Before this, maintenance was derived purely from realized revenue, so a
 * sector running at 40% utilization paid 40% of the maintenance — idle plants
 * were free to hold. That makes over-building costless and removes the whole
 * point of a capacity decision. 0.3 says: an idle plant costs about a third of
 * what a running one costs (fixed site/maintenance/skeleton crew), which is
 * also why {@link MOTHBALL_UPKEEP_FRACTION} sits below it — mothballing is the
 * deliberate, cheaper alternative to holding a plant idle-but-ready.
 *
 * Effective cost basis under plants = utilization + 0.3 × (1 − utilization).
 */
export const IDLE_UPKEEP_FRACTION = 0.3;

/**
 * Smallest share of active nameplate a plant is staffed and paid for, however
 * hard the demand throttle and input throughput cut the run. A plant is never
 * staffed at zero. Tunable: the worldsim lever for how much a glutted plant
 * still pays in wages.
 */
export const PLANT_CREW_FLOOR_SHARE = 0.25;

/**
 * Largest drop in a plant's crew share in one turn, as a share of nameplate.
 * Owner, 2026-10-16: applied at once the rule would cut about 11% of plant jobs
 * in a single turn; at 0.02 a turn the cut lands over several turns, so the
 * labour market and household demand can absorb it. Rehiring is immediate.
 */
/**
 * Share of a plant that runs on its restart turn: back from mothball, or its
 * first capacity just landed. Clearing offers last turn's output, so such a
 * plant has nothing on the market that turn; running it flat out paid full
 * inputs and wages for zero sales (live turn 253: 49 restarted media plants
 * sold 0 of 6.0M units). It is a production factor, not a demand reading.
 */
export const RESTART_RUN_SHARE = 0.25;

export const PLANT_CREW_MAX_DROP_PER_TURN = 0.02;

/**
 * Faster crew drop for a plant stuck at the bottom of the demand throttle.
 * Applies only while the throttle is under {@link PLANT_CREW_SUSTAINED_GLUT_THROTTLE}
 * and the plant has been demand-limited into a glut for at least the idle
 * retirement grace (`demandIdleTurns`). The 0.02 cap exists to stop an
 * economy-wide one-turn layoff (11% of plant jobs, 1.6M, across every throttled
 * plant). This lane is far narrower: on live turn 250 it covered 398 plants
 * with 131k workers, 98k of them above the run, so its worst turn sheds about
 * 10k of 14.4M plant jobs. At 0.02 those plants paid 1.4-2.3x their revenue in
 * wages for 35+ turns, which is what pushed NPP-founded sectors to -200% to
 * -1000% margins.
 */
export const PLANT_CREW_SUSTAINED_GLUT_MAX_DROP_PER_TURN = 0.08;

/** Throttle below which the sustained-glut crew drop applies. */
export const PLANT_CREW_SUSTAINED_GLUT_THROTTLE = 0.25;

/**
 * Share of today's idle upkeep still charged on capacity the demand throttle
 * idled (rather than by the production slider). Not zero, so overbuilding
 * still costs something. Tunable alongside {@link PLANT_CREW_FLOOR_SHARE}.
 */
export const THROTTLE_IDLE_UPKEEP_SHARE = 0.33;

/** Legacy first-plant discount. The qualified 1991 preset pays the full basis. */
export const CAPACITY_FOUNDING_DISCOUNT = 0.1;

/**
 * Share of the capacity taken off a defender that actually arrives at the
 * attacker, under plants. Taking plants, contracts and staff by force wrecks
 * part of them, so the defender loses `capturedUnits` and the attacker receives
 * `capturedUnits * ATTACK_CAPTURE_EFFICIENCY`. The remainder is destroyed, not
 * banked anywhere: aggression shrinks the market it is fought in, so attacking
 * is not a strictly cheaper substitute for building.
 *
 * FLAGGED PROVISIONAL: worldsim re-tunes.
 */
export const ATTACK_CAPTURE_EFFICIENCY = 0.6;

/**
 * How much dearer, per unit actually received, an attack must be than building
 * the same capacity (plants only).
 *
 * The legacy attack price (flat fraction of defender revenue) is unrelated to
 * build cost, so attacking is far cheaper than building and cheap takeovers
 * could bypass construction. Under plants, price is floored at the build price
 * of the capacity received times this premium, applied as a `max` against the
 * legacy cost so an attack is never cheaper than today.
 */
export const ATTACK_BUILD_PRICE_PREMIUM = 1.15;

/**
 * Largest single build order accepted, in capacity units. A sanity bound, not a
 * balance lever: it exists so a fat-fingered or hostile `units` value cannot
 * produce an absurd order or overflow downstream arithmetic. Affordability is
 * the real constraint.
 */
export const MAX_BUILD_UNITS_PER_ORDER = 10_000_000;

// ─── Host-country price level ───────────────────────────────────────────────

/**
 * WHY THE BUILD PRICE IS HOST-INDEXED.
 *
 * `capacityPricePerUnit` is a flat ₳ figure. Charged flat, a plant costs the
 * same in Lagos as in Zurich, so siting is not a real decision. This multiplier
 * is that lever.
 *
 * SOURCE: the state's `economic.costOfLiving`, NOT an exchange rate.
 * - CountryConfig.usdExchangeRate is a seed-file denomination normalizer, not a
 *   price level or FX quote; indexing on it prices builds by authored unit.
 * - Live exchangeRates are nominal: multiplying an ₳ price by a nominal rate
 *   makes capacity structurally cheaper in ₳-real terms wherever a currency is
 *   weak, a pure carry-trade arbitrage. The index must be REAL.
 * - monetaryEra tables are an ERA axis, already carried by
 *   `capacityEraPriceIndex`; using them here double-counts time.
 * - `economic.costOfLiving` is the game's own 100-centered, per-state "how
 *   expensive is it here", denominated in nothing, so immune to the arbitrage
 *   above, and already animated off urbanization and cabinet/housing policy.
 *
 * LIMITATION: `costOfLiving` is a consumer basket, not a construction cost
 * index. Right shape, unvalidated magnitude. PROVISIONAL: if construction ever
 * gets its own metric, repoint here.
 */

/**
 * Clamp band on the host index. `costOfLiving` is bounded [40, 200] by its
 * registry node, which would be a 5× spread on build price — too wide for a
 * proxy this rough, and wide enough that a cabinet effect on cost-of-living
 * becomes a build-price exploit. The band keeps the lever meaningful and the
 * tail bounded. PROVISIONAL.
 */
export const HOST_BUILD_PRICE_INDEX_MIN = 0.6;

export const HOST_BUILD_PRICE_INDEX_MAX = 1.6;
