import type { ObjectId } from "mongodb";
import type { SoeMandate } from "./corporation";
import type {
  CorporationType,
  ManufacturingIndustryModel,
  MediaDiscriminator,
} from "../../constants/corporations";
import type { CountryId } from "../../constants/countries";
import type { ExtractableResource } from "../../constants/commodities";

/**
 * A capacity build order sitting in a sector's `buildQueue` (plants tier, P3a).
 *
 * Capacity is bought, then BUILT: the cash leaves the corp when the order is
 * placed, the capacity arrives `CAPACITY_BUILD_TURNS(sectorType)` turns later.
 * Between those two moments the money is construction-in-progress, spent, not
 * yet productive, which is the whole reason the queue is a persisted object
 * rather than an immediate `capitalStock` increment.
 */
export interface SectorBuildOrder {
  /** Capacity units (output units/day) this order delivers when it lands. */
  unitsOrdered: number;
  /**
   * The strategy this order was PRICED at, stamped when it was placed.
   *
   * Capacity is priced at the RPU of the product it will make, so an order
   * bought while the sector ran a cheap strategy must not silently become
   * capacity for an expensive one. The D9 queue rescale
   * (`rescaleBuildQueueForStrategyChange`) already scales `unitsOrdered` on a
   * retool so the paid basis is preserved; this field is what makes that
   * defence auditable after the fact rather than merely assumed.
   *
   * Absent on orders placed before 2026-09-07, which readers treat as the
   * sector's current strategy.
   */
  strategyId?: string | null;
  /**
   * ₳ (anchor) actually charged for this order, for CIP accounting and for the
   * cancellation refund. 0 for the free growth-ramp flip-compensation order.
   */
  costPaidAnchor: number;
  /** Turn the order was placed. */
  startTurn: number;
  /** First turn on which the capacity converts into `capitalStock`. */
  onlineTurn: number;
  /**
   * True once the shortage build speed-up has shortened this order's remaining
   * window (see turn/corporation/sectorTurn/shortageBuildSpeedup.ts). Each
   * order is accelerated at most once.
   */
  accelerated?: boolean;
  /**
   * When true, the order delivers capacity LINEARLY across
   * `[startTurn, onlineTurn]`, a slice per turn, instead of the whole
   * `unitsOrdered` landing at once on `onlineTurn`. Absent on legacy orders and
   * on the flip-compensation credit, which keep all-at-once landing. See
   * `src/lib/corporations/buildDelivery.ts`.
   */
  smooth?: boolean;
  /**
   * Whole plants: units in one plant of this order's sector, stamped when the
   * order was placed or recounted under `gameConfig.wholePlantsStage`. A smooth
   * order with this set delivers whole plants, never a part-plant slice.
   * Absent = today's linear slices.
   */
  plantUnits?: number;
  /** Paid, secured construction loan. Absent on ordinary cash-funded orders. */
  constructionLoanId?: string;
  constructionClaimId?: string;
}

export interface CorporateSector {
  /** Unified producer market (#4322): written only once the new market settles a turn. */
  producerSettlement?: import("./producerEconomy").ProducerSectorSettlement;
  /**
   * Funded-market cutover transition package: the classification frozen into
   * the reviewed opening plan. Written once by applyProducerOpening, never after.
   */
  cutoverTransition?: import("@/lib/market/producerMarket/transitionRules").SectorTransition;
  /**
   * Last turn capacity of this sector was retired for persistently selling
   * nothing: book value written off and the decommissioning grant paid from
   * unspent public funding (anchor units).
   */
  lastDecommission?: { turn: number; retiredBookAnchor: number; grantAnchor: number };
  /** Lost money or sold nothing on a funded turn inside the window; gets the transition relief. */
  cutoverStruggling?: import("@/lib/market/producerMarket/transitionRules").CutoverStruggling;
  /** Turn the owner used the transition package's free conversion; ends floor support. */
  cutoverConvertedAtTurn?: number;
  /** Funded market: consecutive settled turns this sector sold nothing. */
  producerZeroSalesTurns?: number;
  /** Physical opening generation, advanced atomically with the operating receipt. */
  producerCapacity?: import("./producerEconomy").ProducerGenerationStamp;
  producerInventory?: import("./producerEconomy").ProducerInventoryState;
  /** Per-product asking policies. Fixed unit prices are anchor money, never revenue multipliers. */
  producerQuotes?: Partial<
    Record<
      import("../../constants/commodities").CommodityType,
      import("@/lib/market/producerMarket/rules").ProducerQuotePolicy
    >
  >;
  _id: ObjectId;
  /** Recoverable defence award or factory-allocation operation holding this plant. */
  contractMutationOwner?: string;
  /** Request fence: an earlier request cannot release a resumed operation. */
  contractMutationKey?: string;
  contractMutationRevision?: number;
  contractMutationSequence?: number;
  corporationId: ObjectId;
  /** Country where this sector operates */
  countryId: CountryId;
  stateId: string;
  sectorType: CorporationType;
  /** Optional production model for a specialized manufacturing industry. */
  industryModel?: ManufacturingIndustryModel | null;
  /** Preserves entertainment's legacy operating lane inside canonical media. */
  mediaDiscriminator?: MediaDiscriminator | null;
  /** Optional CEO-defined display name for this specific sector instance */
  displayName?: string;
  /** Player-set target growth rate (% per game year, 48 turns, e.g. 1.5) */
  targetGrowthRate: number;
  /** Actual growth rate applied per turn (trends toward targetGrowthRate) */
  currentGrowthRate: number;
  /** Legacy growthRate field - deprecated, use targetGrowthRate/currentGrowthRate */
  growthRate?: number;
  /** Current daily cost of growth (scales with rate and revenue) */
  currentGrowthCost: number;
  /** Current revenue this sector generates per turn */
  revenue: number;
  /**
   * Realized revenue this sector actually earned last turn (#3001/#3002): the
   * nameplate `revenue` after every realization leg the turn processor applies
   * (production policy, capacity haircut, market clearing/soldFraction,
   * throughput, capital utilization, strikes, total-embargo suspension). Same
   * DAILY basis and home currency as `revenue`. Written every turn so the corp
   * Financials query reads it directly instead of reverse-engineering a single
   * blended corp-wide ratio and smearing it uniformly across sectors. Absent
   * only on sectors not yet reprocessed since this field shipped (fallback
   * behavior in corporationDetail). Never read back into the economy.
   */
  realizedRevenue?: number;
  /**
   * Units telemetry: total output this sector produced this turn, in output
   * units on the same DAILY basis as `revenue` but currency-free. Equals the
   * nameplate implied output units (Σ revenue × rate / basePrice) times the
   * production-side realization legs (production policy, nationalization
   * transition, capacity haircut, throughput, capital utilization, strike).
   * Absent on sectors not reprocessed since this field shipped.
   * Display/telemetry only, never read back into the economy.
   */
  producedUnits?: number;
  /** Exact output units per commodity for an active manufactured product. */
  outputUnitsByCommodity?: Partial<Record<string, number>>;
  /** Nominal output anchor per commodity for the same measured production. */
  outputAnchorByCommodity?: Partial<Record<string, number>>;
  /** Current bounded product quality by output commodity. */
  productQualityByCommodity?: Partial<Record<string, number>>;
  /** Project-owned output from one clearing offer, distinct from baseline recipe output. */
  productLineProjectId?: string;
  /** Turn whose physical project offer and commodity fills were settled. */
  productLineOutputTurn?: number;
  productLineOutputUnitsByCommodity?: Partial<Record<string, number>>;
  productLineSoldUnitsByCommodity?: Partial<Record<string, number>>;
  productLineQualityByCommodity?: Partial<Record<string, number>>;
  /** Raw operating-capacity basis used for the measured product output snapshot. */
  productOutputCapacityUnits?: number;
  /**
   * Plants-tier telemetry: the deliberate market-demand run-rate multiplier
   * applied to this sector's production last turn. 1 means no demand cap;
   * lower values mean the plant was held below its physical plan because
   * recent sales did not support a full run. The legacy clearing pass writes
   * it, or the funded settlement on a funded turn; AI placement and
   * mothballing read it as physical market saturation.
   */
  demandThrottleFactor?: number | null;
  /**
   * Plants tier: consecutive turns this sector was demand-limited into a glut
   * (throttled and selling under the glut fill). Drives idle capacity
   * retirement; 0 resets it. See `rules/idleCapacityRetirement`.
   */
  demandIdleTurns?: number;
  /**
   * Plants tier: share of the market run kept while the plant keeps losing
   * money on its output (1 = no cut), and the signed streak behind it
   * (negative = losing turns, positive = paying turns). See `rules/lossRun`.
   */
  lossRunShare?: number;
  lossRunStreak?: number;
  /**
   * Plants tier: share of active nameplate staffed and paid last turn (1 = full
   * crew). Carried so layoffs are gradual; see `rules/plantRunShare`.
   */
  plantCrewShare?: number;
  /** Owned capacity units retired last turn because the market would not buy them. */
  idleCapacityRetiredUnits?: number;
  /**
   * Units this sector could have produced after external constraints but before
   * the operator's production-policy and mothball choices. Used by supply
   * agreement damages. Absent until the sector has run after rollout.
   */
  contractAchievableUnits?: number;
  /**
   * Units telemetry: the share of `producedUnits` that cleared this turn,
   * `producedUnits × soldFraction` when market clearing ran, else equal to
   * `producedUnits`. Same DAILY, currency-free basis.
   * Display/telemetry only, never read back into the economy.
   */
  soldUnits?: number;
  /**
   * Share of this plant's output (0..1) shipped to a government arsenal under a
   * defence procurement contract last delivery, and the turn that happened.
   *
   * Output sold to the state does not also reach the commodity market. Without this
   * a contracted plant supplied its full output to the world AND was paid again per
   * lot: one plant's production earning twice, scaling with however many contracts
   * a friendly minister chose to write.
   *
   * Read back into the economy in exactly two places, both gated on the turn being
   * fresh so a completed or cancelled contract stops biting with no cleanup pass:
   * the `hourlyRevenue` realization leg in `sectorTurn` (the cash) and the supply
   * contribution in `computeRawSupplyDemand` (the goods).
   */
  militaryDivertedFraction?: number;
  militaryDivertedTurn?: number;
  /**
   * True when this (foreign-national) sector is suspended by a TOTAL embargo the
   * operating country has against the corp's nation: revenue is frozen and it
   * earns/spends nothing this turn. Reversible, clears when the embargo lifts.
   */
  embargoSuspended?: boolean;
  /**
   * Under the trade-exposure embargo model, the export-exposed fraction (0-1) of
   * this sector's output that the embargo stripped this turn. 0 under the legacy
   * total-mothball path or when unembargoed. Drives the "N% trade-restricted" UI.
   */
  embargoExportExposure?: number;
  /** Profit margin percentage (0-100). Maintenance = revenue × (1 - profitMargin/100) */
  profitMargin: number;
  /**
   * Workers this sector actually STAFFS. Rationed against the state's civilian
   * labour force when that state's corporate sectors collectively want more
   * people than it has (phase 2). Every consumer of headcount reads this one:
   * union dues charge these members, the per-state wage and automation indices
   * weight by them, and shedding sheds them.
   */
  workers: number;
  /**
   * Workers this sector WANTS at its current revenue, before rationing. Equal to
   * `workers` in any state with a slack labour market. Display and telemetry
   * only: next turn's tightness reading sums this rather than `workers`, since
   * summing the rationed result would converge tightness to 1 and switch the
   * rationing back off.
   */
  workersDesired?: number;
  /**
   * The pro rata share of desired headcount this sector could staff, 0 to 1.
   * 1 wherever the labour market is not oversubscribed. Persisted so the UI can
   * explain a throttled sector as understaffed rather than leaving the output
   * gap unattributed.
   */
  labourStaffingFactor?: number;
  /**
   * Labour system (labourSystemMode ≥ "wages"): wage-level multiplier on the
   * sector's baseline labor cost. 1.0 = baseline, which is profit-invariant
   * (the labor slice is carved out of existing maintenance, not added on top).
   * Player-editable from Phase 2; absent/undefined is treated as 1.0.
   * See docs/plans/2026-06-30-labour-system.md.
   */
  wageLevel?: number;
  /**
   * The margin this sector actually operated at last turn, seeded
   * `profitMargin` plus every modifier applied that turn (commodity markets,
   * SOE mandate, tech effects, strike penalty, nationalisation penalty).
   * Display/analytics only; never read back into the economy.
   *
   * `profitMargin` itself is a seeded constant no turn phase writes to, so
   * without this the modifiers were computed and immediately discarded and the
   * stored margin showed min == max for an entire run.
   */
  effectiveProfitMargin?: number;
  /** Logistical sprawl margin (pp, negative) the turn applied to this sector last turn. */
  sprawlMarginPp?: number;
  /**
   * Dominance margin penalty (pp, negative) the turn applied to this sector last
   * turn, after the plants fade, tech shield and any running-cost scale. The
   * sector page shows it instead of re-deriving it from the share.
   */
  dominanceMarginPenaltyPp?: number;
  /**
   * Labour system telemetry: most recent per-turn labor cost written when
   * labourSystemMode ≥ "wages" (home currency, daily basis like `revenue`).
   * Display/analytics only, not read back into the economy. Absent when the
   * labour system is off.
   */
  laborCost?: number;
  /**
   * Labour system telemetry: implied wage per worker (home currency, daily
   * basis), written alongside `laborCost`. Surfaced in the UI against the
   * state's median income. Display/analytics only. Absent when off.
   */
  wagePerWorker?: number;
  /**
   * v3 Phase 5/6 (labourSystemMode ≥ "unions"): per-sector NPC unionization
   * pressure, 0, 100. Drifts toward a condition-driven target each turn (see
   * `src/lib/labour/unionization.ts`). Feeds a standing labor-cost surcharge
   * (`unionPremium()`) and the strike trigger threshold (`src/lib/labour/strikes.ts`).
   * Absent/undefined is treated as 0 (no ambient unionization before the
   * system has run).
   */
  unionization?: number;
  /**
   * Union dues v1: which union represents this sector's workers, or absent when
   * nobody does. One union per sector, winner takes all.
   *
   * Before this, a union implicitly covered every sector matching its
   * (countryId, sectorType) and nothing could be held or contested. Now a union
   * head runs a targeted organizing drive at a specific sector, and if it lands
   * against an incumbent it takes representation outright: the sector's workers
   * become the raider's members and its dues follow. Raids are same-industry
   * only, so this always points at a union whose `sectorType` matches.
   *
   * The representing union's `approval` anchors this sector's unionization
   * drift target, which is why losing a sector costs the loser density as well
   * as headcount.
   */
  representingUnionId?: ObjectId | null;
  /**
   * v3 Phase 6 (labourSystemMode ≥ "unions"): a slow-moving index of what
   * workers expect to be paid in real terms, trended toward the sector's
   * current real-wage index (`realWageIndex()` in unionization.ts) at most
   * `WORKER_EXPECTATION_TREND_STEP` per turn. The strike trigger fires when
   * this lags the real wage by more than a threshold. Absent/undefined ⇒
   * initialized at the current real-wage index on first read (no first-turn
   * gap). See `src/lib/labour/strikes.ts`.
   */
  workerExpectationIndex?: number;
  /**
   * v3 Phase 6: turn a strike began, or null when no strike is active. While
   * non-null, revenue is throttled and margin takes a penalty (see
   * `STRIKE_REVENUE_THROTTLE`/`STRIKE_MARGIN_PENALTY_PP` in strikes.ts).
   * Cleared (set to null) on resolution (concession or wait-it-out).
   */
  strikeStartedAtTurn?: number | null;
  /**
   * v3 Phase 6: turn after which this sector may strike again, or null when
   * not in cooldown. Set on every strike resolution (concession or
   * wait-it-out), the cooldown is unconditional, not just a waitout
   * consequence (see `STRIKE_COOLDOWN_TURNS` in strikes.ts).
   */
  strikeCooldownUntilTurn?: number | null;
  /**
   * v3 Phase 7 (labourSystemMode ≥ "full"): turn after which this sector's
   * CEO may attempt another union-busting action, or null when not in
   * cooldown. Set on every busting attempt (success or backfire), see
   * `src/lib/labour/unionBusting.ts`.
   */
  bustingCooldownUntilTurn?: number | null;
  /** Active operating strategy ID (defaults to "standard") */
  strategyId?: string;
  /**
   * Price-realization multiplier applied to this sector's realized revenue
   * last turn (marketSystemMode >= "realization", audit t806 Fix 1). Weighted
   * lagged market-price/base ratio of the sector's output mix, clamped
   * [0.7, 1.5]. Telemetry/display only, never read back into the economy.
   */
  priceRealization?: number;
  /**
   * Throughput coupling (marketSystemMode >= "clearing", audit t806 D1): the
   * ramped input-availability multiplier applied to realized revenue last
   * turn, the scarcest (binding) input, and the ramp anchor turn. Telemetry +
   * ramp state; the factor itself is recomputed each turn.
   */
  throughputFactor?: number;
  throughputBindingInput?: string | null;
  throughputStartTurn?: number | null;
  /**
   * Share of this sector's offered output (0..1) that no freight network could
   * place last turn: produced, offered, and undeliverable. Distinct from a
   * demand failure, which is what `soldFraction` already carries. Split out so
   * a player can tell "nobody wanted it" from "it could not get there", the
   * two being opposite instructions about what to do next.
   */
  deliveryLimitedFraction?: number;
  /** Cargo class of the output leg with the largest delivery-limited share. */
  deliveryLimitedFreightClass?: "bulk" | "special" | "grid" | null;
  /**
   * Canonical freight billing v1 (issue #897,
   * gameConfig.canonicalFreightBillingEnabled, default off): the shipping cost
   * this sector was charged last turn for its state's inbound hauls of the
   * commodities it consumes. Named cost line on the same daily basis and host
   * currency as `revenue` / `laborCost`, persisted so a later financials
   * bridge can show "freight" instead of a blended haircut. The amount also
   * rides the sector's cost leg into corp income, so it is real money while
   * the flag is on. Absent on worlds that never billed.
   */
  freightBillingCharge?: number;
  /**
   * The transfer's other half: haul revenue this sector's freight supply
   * earned last turn, apportioned by supply share in its state. Named revenue
   * leg, same basis and gate as `freightBillingCharge`; rides the sector's
   * revenue into corp income while the flag is on.
   */
  freightBillingCredit?: number;
  /** Turn the freight billing legs above were computed for. */
  freightBillingTurn?: number;
  /**
   * Posted-price market clearing (marketSystemMode >= "clearing", audit t806
   * Fix 2). `pricingPosture` is the CEO's posted price relative to market
   * (−0.2 … 0.2); null/absent = auto-position (NPP/unowned heuristic).
   * `clearingFactor` (ramped, applied), `soldFraction` and
   * `effectivePosture` are last turn's telemetry; `clearingStartTurn`
   * anchors the fade-in ramp.
   */
  pricingPosture?: number | null;
  /** Last turn's actual reserved physical deliveries. Cleared with the sector on reset. */
  internalSupplyReceipt?: {
    turn: number;
    discountCostAnchor?: number;
    received: Partial<Record<import("../../constants/commodities").CommodityType, number>>;
    reserved: Partial<Record<import("../../constants/commodities").CommodityType, number>>;
  };

  /** Optional industrial input-indexed pricing; ignored while explicit plant costs are off. */
  pricingMode?: "market" | "costPlus";
  /** Last producing turn's actual operating costs per nominal output value. */
  costPlusCostBasis?: {
    inputCostShare: number;
    fixedCostShare: number;
    turn: number;
  };
  clearingFactor?: number;
  soldFraction?: number;
  /**
   * Per-output sold fraction behind the weighted `soldFraction` headline. A
   * multi-output sector can clear one commodity fully and another barely, and
   * the blended number reads as though the short commodity is the one not
   * selling. Only written when clearing ran.
   */
  soldByCommodity?: Partial<Record<string, number>>;
  /** Turn whose clearing pass produced soldFraction and soldByCommodity. */
  soldByCommodityTurn?: number;
  /**
   * Each output's share of realized revenue from the same clearing pass
   * (sums to ~1). Lets the sector page show a sale price per product on a
   * multi-output sector. Absent on sectors not cleared since it was added.
   */
  revenueShareByCommodity?: Partial<Record<string, number>>;
  /** Exact units from that clearing pass; absent for legacy or recording-off turns. */
  soldUnitsByCommodity?: Partial<Record<string, number>>;
  soldUnitsByCommodityTurn?: number;
  effectivePosture?: number;
  clearingStartTurn?: number | null;
  /**
   * Consecutive turns the sector cleared less than STRANDED_LOW_FILL_THRESHOLD
   * of its output (clearing mode only; mothballed turns hold the count). The
   * chronic-stranding signal behind the player stranded-plant warning and the
   * NPP stranded-divest - one turn of soldFraction flickers on market noise,
   * this does not.
   */
  lowFillTurns?: number;
  /**
   * Consecutive turns the sector's measured P&L was negative (plants
   * `plantsPnl.profit < 0`). Maintained by the NPP decision pass for NPP-run
   * corps only - players never get this field written - and reset on the
   * first profitable turn and on mothball restart. The chronic-cost-loss
   * signal behind NPP cost-mothballing (demand audit step 5): fill-based
   * machinery cannot see a plant that sells everything yet bleeds on costs.
   */
  pnlLossTurns?: number;
  /**
   * Turn the OWNER last reactivated this sector by hand. Autopilot corporations
   * will not auto-mothball it for MANUAL_RESTART_GRACE_TURNS afterwards
   * (nppCorporationTuning). Written only by the player reactivate commands.
   */
  manualReactivatedTurn?: number;
  /**
   * Player toggle (design-realization-legs §6): true = the unsold remainder of
   * storable outputs becomes sector inventory; absent/false = sell-all, the
   * unsold remainder evaporates (legacy behavior). CEO-set, default off.
   */
  stockpileUnsold?: boolean;
  /**
   * Inventory pile, units per storable output commodity (daily unit basis,
   * same as producedUnits). Spoils per COMMODITY_SPOILAGE_PER_TURN, carries a
   * flat per-turn cost, and sells down when the fresh offer fully clears -
   * see sectorInventory.ts.
   */
  inventoryUnits?: Partial<Record<string, number>>;
  /** ₳ value of the pile at mix price (telemetry, display only). */
  inventoryValueAnchor?: number;
  /** Units sold down / lost to spoilage last turn (telemetry). */
  inventoryDrainedUnits?: number;
  inventorySpoiledUnits?: number;
  /**
   * Capital tier (marketSystemMode >= "capital", audit t806 Fix 4 v1):
   * productive capacity in output units/turn. Seeded with 10% headroom at
   * first exposure (mode flip is a no-op); grows with the growth slider,
   * decays by depreciation each turn. `capitalUtilization` is last turn's
   * output-gating factor (telemetry).
   */
  capitalStock?: number;
  /** Last turn's physical capacity in its blended recipe units during retooling. */
  operatingCapacityUnits?: number;
  operatingCapacityTurn?: number | null;
  capitalUtilization?: number;
  /**
   * First-class whole facilities owned by this sector. Unlike capitalStock,
   * this count does not become fractional through depreciation. PvP transfers
   * this ownership unit; productive capacity and paid basis follow the plants
   * pro-rata. Optional until the value-conserving plants migration runs.
   */
  plantCount?: number;
  /**
   * Delivered capacity fragments accumulated toward the next whole facility.
   * Always less than the sector's facility quantum after normalization.
   */
  plantUnitRemainder?: number;
  /**
   * Whole plants (gameConfig.wholePlantsStage on): wear toward the next plant
   * coming off, in capacity units, always below one plant. With the stage on,
   * `plantUnitRemainder` is construction credit that does not produce and
   * `capitalStock` is always `plantCount` whole plants.
   */
  plantWearUnits?: number;
  /**
   * Plants tier (marketSystemMode >= "plants"): anchors the launch-safety
   * governor's fade-in from the sector's first plants turn, exactly like
   * `clearingStartTurn` does for the clearing leg. Stamped once, on the turn
   * the sector first runs under plants (the flip turn), and never moved after.
   */
  plantsStartTurn?: number | null;
  /** NPP greenfield birth turn for maturation protection in every market mode. */
  nppFoundedTurn?: number;
  /**
   * Plants tier: true for a sector a player-run company built (or split off)
   * while plants was already on. The launch-safety governor exists to smooth a
   * running sector across the plants flip; a sector born under plants has no
   * prior revenue to smooth, so it earns its derived market revenue from its
   * first turn instead of being held near the governor anchor for the ramp.
   */
  plantsGovernorExempt?: boolean;
  /**
   * Plants tier (P3a): outstanding capacity build orders, oldest first. Each
   * order is capacity that has been PAID FOR but is not yet productive; it
   * converts into `capitalStock` on the turn `onlineTurn` is reached, and the
   * order is then removed from the queue.
   *
   * Absent/empty on every sector that has never ordered a build, and never
   * written outside plants mode.
   */
  buildQueue?: SectorBuildOrder[];
  /**
   * Last turn whose build deliveries landed on this sector, written by the
   * corporation turn in the same update as the deliveries. The next run
   * delivers every slice due after it, so an economy pause defers builds
   * instead of dropping them, and a replayed turn delivers nothing twice
   * (#5169). Absent until the sector's first run.
   */
  buildDeliverySettledTurn?: number;
  /** Frozen funded build claim and its cash escrow; absent on legacy sectors. */
  constructionFinancing?: import("@/lib/banking/rules/constructionBuild").ConstructionBuildClaim;
  /** A durable owner mutation excludes new construction claims until completion. */
  constructionPropertyTransition?: {
    key: string;
    kind: string;
    /**
     * Abandon resume bookkeeping (#4190). Records the last durable step so a
     * retry resumes instead of repeating a brand hit or a build refund.
     */
    stage?: "reserved" | "brandApplied" | "refunded";
  };
  /**
   * Key of the pledged-site sale this site is absorbing. Set in the same write
   * as the fold and cleared once the sold row is gone, so a resumed purchase
   * never folds the same site in twice.
   */
  securedSaleFold?: string;
  /** Stable mode marker for an interrupted funded single-sector nationalization. */
  pendingFundedNationalization?: { operationKey: string };
  /**
   * Plants tier (P3a): construction in progress, in ₳ (anchor), the sum of
   * `costPaidAnchor` across the outstanding `buildQueue` orders (D10).
   *
   * Denormalized so balance-sheet / valuation readers do not have to sum the
   * queue on every read; kept in sync by the turn processor whenever orders
   * land, and by the build/cancel commands when orders are pushed or removed.
   */
  constructionInProgressAnchor?: number;
  /**
   * Plants tier (P5): the PAID BASIS of the capacity in `capitalStock`, in ₳
   * (anchor), cumulative cash actually spent to acquire the units the sector
   * still owns, after depreciation.
   *
   * This exists because exits settle at BOOK, and book used to be
   * `capitalStock × capacityPricePerUnit`, the RAW list price. Builds are
   * charged that list price times a stack of discounts (founding 0.1×, CEO
   * acumen down to 0.5×, tech 0.7×, a cheap host state 0.6×), so a founding
   * build cost 3M ₳ and booked at 30M ₳: restructuring at the 0.85 salvage
   * fraction CREDITED 8.5× the cash spent. That is money creation, not a
   * transfer.
   *
   * Maintenance rules (the turn processor owns the first three):
   *   - a build order that lands moves its `costPaidAnchor` out of CIP and INTO
   *     this field;
   *   - depreciation scales this field by exactly the factor it scales
   *     `capitalStock` by, so the PER-UNIT basis is preserved;
   *   - the flip turn seeds it at `capacity × capacityPricePerUnit × 1.0` for
   *     capacity that predates the plants tier (that capacity was bought
   *     through the legacy growth stack at that price).
   * Transfers (merge/carve/attack/shed/haircut) move it PRO-RATA with the
   * capacity. Free capacity (R&D breakthroughs, world grants) carries NO basis:
   * it dilutes the per-unit book rather than adding to it.
   *
   * ABSENT ⇒ the readers fall back to `capitalStock × capacityPricePerUnit`,
   * i.e. exactly the pre-P5 behaviour, so no legacy or seeded row crashes or
   * silently books at zero. See `sectorCapacityBookAnchor`.
   */
  capacityBookAnchor?: number;
  /**
   * Plants tier (P3.5): the sector's OTHER operating cost, in ₳ (anchor) per
   * output unit per TURN, overheads, distribution, insurance, rent: everything
   * the physical cost model does not name explicitly.
   *
   * This is not a designed constant. It is SOLVED once, on the sector's first
   * producing physical-P&L turn, so that the physical cost lines reproduce the
   * old margin formula's cost EXACTLY at that turn's state, and then HELD. That
   * is what makes the switch to physical costs a no-op on flip day while
   * letting input prices, wages and throughput move the bill afterwards.
   *
   * Absent on every sector that has not yet run a producing plants turn; never
   * written outside plants mode. See `src/lib/corporations/physicalPnl.ts`.
   */
  otherOpexPerUnitAnchor?: number;
  /**
   * Plants tier (P3.5): `1 − margin/100` of the non-physical margin stack at
   * the turn `otherOpexPerUnitAnchor` was solved. The denominator of the drift
   * factor that lets subsidies, tariffs, macro drag and tech margin bonuses keep
   * moving the held residual, 1 at calibration by construction.
   */
  otherOpexAnchorMarginBasis?: number;
  /**
   * Plants tier: `1 − margin/100` at the sector's FIRST plants turn, held
   * thereafter as the price basis of the idle-capacity upkeep charge.
   *
   * Idle upkeep is a fixed site/skeleton-crew cost (see
   * `IDLE_UPKEEP_FRACTION`), so it must not float with the live margin. Pricing
   * it off `1 − margin_now` made the charge GROW as the margin fell, hardest on
   * the sectors already closest to insolvency. Anchoring it is the same
   * solve-once-then-hold discipline `otherOpexPerUnitAnchor` uses.
   *
   * Absent on legacy rows and outside plants mode; readers fall back to the
   * live basis, i.e. the pre-fix behaviour. See `idleUpkeepUnitPrice`.
   */
  plantsUpkeepMarginBasisAnchor?: number;
  /**
   * Plants tier (ticket 1122): the assembled physical P&L the turn ACTUALLY
   * booked for this sector, persisted so read surfaces stop rebuilding it out
   * of `effectiveProfitMargin`.
   *
   * `effectiveProfitMargin` is an OUTPUT of this P&L, and a capped one:
   * `derivedMarginPct = min(100, 100 x (1 - operatingCost / revenue))`. The cap
   * is right for a display percentage and wrong as a source of money. When a
   * sector's policy credit outruns its operating bill the operating cost goes
   * NEGATIVE and the booked profit legitimately exceeds revenue, but a reader
   * inverting the capped percentage recovers an operating cost of exactly zero
   * and reports profit == revenue. Nine prod media sectors sat at the cap.
   * Inverting the percentage also silently drops upkeep and compliance, which
   * are outside the margin's scope but inside the profit.
   *
   * Every field is on the DAILY basis and in the same stored currency as
   * `revenue` and `laborCost`. The NPP decision engine reads the persisted
   * revenue, profit, and margin as its lagged profitability signal; the values
   * never feed physical settlement itself. Written on every physical-P&L turn,
   * absent below plants and on sectors that have not run a plants turn since
   * this shipped, and readers keep their old margin-inversion path as the
   * fallback.
   */
  plantsPnl?: {
    /** Absent on older snapshots, which use the legacy residual. */
    costModel?: "legacyResidual" | "explicit";
    /** Positive plant services within otherOpex, never an additional bill. */
    plantOverhead?: number;
    /**
     * Realized revenue the P&L was assembled against, inventory sell-down
     * included. Equals the persisted `realizedRevenue` exactly.
     */
    revenue: number;
    /** Inventory sell-down revenue inside `revenue`. */
    inventoryRevenue: number;
    /** Inventory carrying cost inside `totalCost`. */
    inventoryCarry: number;
    /** "funded" when a funded producer receipt wrote the row (only the summary lines are set). */
    source?: "funded";
    /** Funded market: inputs in output that went to stock unsold this turn, at cost (reported beside profit). */
    stockAddedAtCost?: number;
    /** Funded market: transition floor support received this turn (reported beside profit). */
    transitionSupport?: number;
    /** Matched own-site management-account entries, daily host-currency money. */
    internalSupplyIncome?: number;
    internalSupplyCharge?: number;
    inputs: number;
    labour: number;
    upkeep: number;
    compliance: number;
    /**
     * SIGNED: the calibration residual is negative on most prod sectors. This
     * is the figure actually charged: when the credit exceeded every named
     * cost line it was clamped to them (`otherOpexCreditCapped`).
     */
    otherOpex: number;
    /**
     * True when the residual credit was clamped to the named bills this turn.
     * The raw anchor-times-units product is `otherOpexUncapped`; the gap
     * between the two is profit the sector would otherwise have invented.
     */
    otherOpexCreditCapped?: boolean;
    otherOpexUncapped?: number;
    /** Matching internal discount charge (positive) or input credit (negative), daily local money. */
    internalSupplyDiscountCost?: number;
    financialLegs: number;
    /**
     * The policy/tech modifier stack as money. POSITIVE is a credit that
     * lowers cost, negative a charge. This is the single channel through which
     * tariffs, subsidies, state metrics, regional conditions, tech margin
     * bonuses, strategy transition and the SOE/nationalization terms reach a
     * plants sector's profit.
     */
    policyCredit: number;
    /** The same stack in percentage points, after the soft cap. */
    policyPp: number;
    /** inputs + labour + otherOpex + financialLegs - policyCredit. */
    operatingCost: number;
    /** operatingCost + upkeep + compliance + growth + inventory carry. */
    totalCost: number;
    /** revenue - totalCost. The number the turn booked. */
    profit: number;
    /** Turn this was written on, so a stale row is recognisable. */
    turn: number;
  };
  /**
   * Plants tier (P3a, D12): the sector is MOTHBALLED. Its capacity produces
   * nothing and offers nothing to the market, and it pays only
   * MOTHBALL_UPKEEP_FRACTION of the maintenance it would carry while running.
   * Reactivation is free and has no cooldown in v1.
   */
  mothballed?: boolean;
  /** Plants kept active, 1..100. Absent means 100. The remainder pays cold upkeep.
   * Owned capacity and paid basis are unchanged. Only capacity commands write this field. */
  activeCapacityPercent?: number;
  /**
   * ROLLBACK SAFETY: capital-mode restore point. Remove after the rollback
   * drill passes. (Plants tier, D13.)
   *
   * Under plants the nameplate `revenue` stops compounding and is RESTATED each
   * turn from what the sector's plants produce and sell. That restatement is
   * destructive: once plants has run for a few turns the pre-plants revenue
   * series no longer exists anywhere, so flipping `marketSystemMode` back down
   * to "capital" would resume compounding from a plants-derived number and
   * silently rebase every corp's income.
   *
   * This field is the shadow of the series we stopped writing: each turn under
   * plants it stores what the pre-plants compounding chain WOULD have written
   * for `revenue` (`preFlipNameplateRevenue`, the exact figure capital mode
   * would have produced, which is also what the launch-safety governor clamps
   * against). Same DAILY basis and same host currency as `revenue`.
   *
   * NOTHING READS THIS IN THE SIMULATION. It exists so a rollback is a data
   * operation instead of an archaeology project, see
   * `restoreCapitalModeFromShadow` and
   * `scripts/migrations/2026-08-01-restore-capital-mode-from-shadow.ts`.
   *
   * Nullable, like `plantsStartTurn`: the transfer folds in
   * `sectorTransferCapex` write an explicit `null` when NEITHER side of a merge
   * carried a restore point, which readers treat identically to absent.
   */
  legacyRevenueShadow?: number | null;
  /**
   * The pre-plants growth chain that drives {@link legacyRevenueShadow}, kept
   * alongside it for the same reason.
   *
   * Under plants `targetGrowthRate` is forced to 0 and `currentGrowthRate`
   * trends down to meet it, so the LIVE growth fields stop describing the
   * counterfactual within a few turns of the flip. These two are stamped from
   * the live values on the flip turn and then trended on their own, so the
   * shadow revenue series can compound at the rate capital mode would have
   * used rather than at the zeroed plants rate. A rollback restores the live
   * growth fields from these, otherwise capital mode would resume compounding
   * a correct nameplate at a growth rate of zero.
   *
   * NOTHING READS THESE IN THE SIMULATION.
   */
  legacyGrowthRateShadow?: number;
  /** @see legacyGrowthRateShadow, the target leg of the same frozen chain. */
  legacyTargetGrowthRateShadow?: number;
  /**
   * Capital book anchor (₳), a depreciated high-water mark on the sector's
   * going-concern value (sectorNPV), used as a tangible-book floor under capital
   * mode. Seeded at the current NPV on first exposure (mode flip is a no-op),
   * ratchets up with NPV, and decays slowly when NPV falls, so a corp that
   * invested in real capacity isn't valued as if it owns nothing during a
   * transient profit dip, without ever exceeding its own historical peak.
   */
  capitalBookAnchor?: number;
  /** Strategy being transitioned FROM (null when not transitioning) */
  transitionFromStrategyId?: string | null;
  /** Turn when the current strategy transition began */
  transitionStartTurn?: number | null;
  /**
   * D9: did the retool that opened this transition actually apply the RPU
   * `capitalStock` rescale? Written alongside `transitionFromStrategyId` by
   * `setSectorStrategy`, read by `cancelSectorStrategy`.
   *
   * The rescale is plants-gated and each command resolves the gate at its own
   * call time, so a retool committed under capital mode and cancelled after a
   * flip to plants would apply the INVERSE ratio to a stock that was never
   * scaled: a permanent mint or burn of the whole RPU ratio, which reaches
   * 327x for a coal to rare-earth pair. Persisting the decision makes the
   * inverse conditional on the forward step having happened, so the pair can
   * never come apart across a mode change. Absent on legacy rows: the sector
   * turn converts a provably unconverted stock (committed before the sector's
   * first plants turn, issue #2009) and stamps true; a legacy row committed
   * under plants converted its stock at the boundary and only ever needs the
   * opex-anchor heal.
   */
  retoolRescaleApplied?: boolean;
  /**
   * Set once the entertainment commodity removal rescaled this sector's owned
   * units onto the advertising basis (migrateEntertainmentRemoval).
   */
  entertainmentRemovalRescaleApplied?: boolean;
  /** Turn after which a new strategy change is allowed (transition end + cooldown) */
  transitionCooldownUntilTurn?: number | null;
  /**
   * Last strategy change made by a controlling parent's CEO on an AI-run
   * subsidiary (audit). The AI manager does not retool the sector while
   * `currentTurn < untilTurn`.
   */
  parentDirectedStrategy?: {
    byCorporationId: ObjectId;
    byUserId: ObjectId;
    strategyId: string;
    atTurn: number;
    untilTurn: number;
  } | null;
  /** Turn the extraction auto-strategy phase adopted a focused mining strategy here (audit trail). */
  autoStrategyAdoptedAtTurn?: number;
  /** True when transition is running backward toward original strategy (cancel in progress) */
  isReversing?: boolean;
  /** CEO-set target production level (-25 to +25). Trends toward this value at 1/turn. */
  productionPolicy?: number;
  /** Currently active production level (-25 to +25). Trends toward productionPolicy each turn. */
  productionPolicyLevel?: number;
  /**
   * Counter for the sustained-negative-production margin penalty. Increments
   * by 1 per turn while productionPolicyLevel < 0 and decrements by 1 (floored
   * at 0) per turn otherwise. Penalty schedule lives in
   * `getSustainedNegativeProductionPenalty`. Absent on legacy sectors,
   * treated as 0 by the turn loop until first computed.
   */
  negativeProductionSustainedTurns?: number;
  /** Per-sector public-service posture; overrides the corp-wide `soeMandate` (spec §11.4). */
  soeMandate?: SoeMandate;
  /**
   * Turn this sector was absorbed by nationalization. Powers the re-privatization
   * cooldown (spec §13.4); absent on seeded / split-off / private sectors.
   */
  absorbedAtTurn?: number;
  /**
   * Prior-owner provenance stamped at taking time so an executive/emergency
   * nationalization can be UNDONE (e.g. a Supreme Court strike-down of the
   * emergency taking). Records who held the sector and its pre-haircut economics
   * before the state absorbed it. Absent on seeded / never-nationalized sectors,
   * and on takings that predate this field. On a NatCorp merge this reflects the
   * MOST RECENT taking folded into the surviving row.
   */
  nationalizationProvenance?: {
    /** The corporation that held this sector immediately before the taking. */
    formerCorporationId: ObjectId;
    /** The sector's home country before the taking (usually the taking country). */
    formerCountryId?: string;
    /** Revenue (donor currency) before the transition haircut. */
    formerRevenue?: number;
    /** Capital stock before the transition haircut (plants mode). */
    formerCapitalStock?: number;
    /** Turn the taking occurred. */
    takenAtTurn: number;
  };
  /**
   * Turn this sector was nationalized, anchor for the transition productivity
   * shock (decays over NATIONALIZATION_TRANSITION_TURNS). Stamped at the moment of
   * a taking; absent on never-nationalized sectors (no shock).
   */
  nationalizedAtTurn?: number;
  /**
   * Extraction capacity utilization ∈ [0,1] from the last turn, the
   * revenue-weighted fraction of this sector's resource output that its
   * operating state's capacity actually admits. 1 = unconstrained. Display +
   * the revenue haircut read this. Absent on non-extraction sectors.
   */
  capacityUtilization?: number;
  /** The extractable resource that most constrains this sector (lowest capacity
   *  multiplier), or absent when the sector is unconstrained. Display only. */
  capacityBindingResource?: ExtractableResource;
  /**
   * Turn this sector first came under the capacity revenue haircut, anchor for
   * the transition ramp (fades none → full over EXTRACTION_CAPACITY_HAIRCUT_TURNS).
   * Stamped the first time an extraction sector is processed; absent otherwise.
   */
  capacityHaircutStartTurn?: number;
  /**
   * SOCI escalation multiplier (`sociMultiplier`) captured when this sector was
   * nationalized: fixes the transition shock's depth/length to how concentrated
   * the state was THEN, so later takings can't retroactively deepen an
   * already-settled sector's digestion. Absent ⇒ 1 (base transition); the
   * grandfather migration backfills 1 for pre-rebalance sectors.
   */
  nationalizationTransitionMultiplier?: number;
  /**
   * Sector-wide bill scope stamped at enactment (`all` | `corporations` |
   * `unowned` | `npp_unowned`). Drives heal/merge guards so unowned-only takings
   * do not purge legitimate corps.
   */
  sectorNationalizationScope?: "all" | "corporations" | "unowned" | "npp_unowned";
  /** Carve fraction from the sector-wide bill that created/expanded this holding. */
  sectorNationalizationCarveFraction?: number;
  /**
   * Active for-sale listing on this sector. Set when the CEO lists the sector
   * on the secondary market; cleared on unlist or when ownership transfers.
   * Asking price is locked at listing time so buyers see a stable quote even
   * if margins shift before purchase.
   */
  /**
   * NPP pickup in progress on a sector leaving its owner (abandon, dissolution,
   * restructure liquidation). Written before any capacity moves so a retry
   * credits the same receiver once. See `nppPickup.ts`.
   */
  nppPickup?: {
    key: string;
    receiverCorporationId: ObjectId;
    receiverSectorId: ObjectId;
    merge: boolean;
  };
  /** Pickup keys already credited to this row, newest last, capped. */
  nppPickupReceipts?: string[];
  forSale?: {
    foreclosed?: boolean;
    pledged?: boolean;
    /** When the listing was created */
    listedAt: Date;
    /**
     * Asking price in ₳ (anchor). Locked at listing time as
     * SECTOR_FOR_SALE_PRICE_FRACTION × yearly profit / NPV_ANNUAL_DISCOUNT_RATE.
     */
    priceAnchor: number;
    /** NPV in ₳ at listing time, recorded for transparency / display */
    npvAnchor: number;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}
