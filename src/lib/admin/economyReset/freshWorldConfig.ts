/**
 * Game configuration a rebuilt economy starts from.
 *
 * The economy-only reset keeps the political world but rebuilds every company
 * and plant from the era seed. Those plants must meet the same configuration a
 * fresh bootstrap gives them: the fresh-world gameplay flags, and none of the
 * knobs that were staged onto the old economy to steer it. Every stage, glide,
 * governor bound and funded-market lever below describes the economy the reset
 * deletes, so it is unset here. Market mechanics that are not tied to one
 * economy's history are listed in FRESH_PLANTS_CONFIG_KEPT with the reason,
 * and freshWorldConfig.test.ts fails when a new staged knob is in neither list.
 */
import type { UpdateFilter } from "mongodb";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import {
  STALE_MARKET_MODE_STAMP_UNSET,
  STALE_PER_WORLD_GAME_CONFIG_UNSET,
} from "@/lib/admin/seed/coreGameConfigUpdate";
import { FRESH_WORLD_GAME_CONFIG_FLAGS } from "@/lib/seeds/reference/featureFlagDefaults";

/** Staged knobs that only ever steered the economy the reset deletes. */
export const FRESH_PLANTS_CONFIG_UNSET: Readonly<Record<string, "">> = Object.freeze({
  // Legacy market recovery ladder (price memory damping, margin trim relief,
  // service labour relief): patches for the old formula market.
  marketRecoveryStage: "",
  // Launch-safety governor on the plants tier: cap, ramp and every glide field.
  // A rebuilt plants economy starts clean, with no deviation cap to glide off.
  marketGovernorCap: "",
  marketGovernorGlideTurns: "",
  marketGovernorGlideStartTurn: "",
  marketGovernorGlideMode: "",
  marketGovernorGlideFloor: "",
  // Launch guard references measured on the old market's valuation.
  marketGuardReferenceMcap: "",
  marketGuardReferenceFundamentalMcap: "",
  marketGuardReferenceTurn: "",
  marketGuardTrippedAt: "",
  // Funded producer market levers. They are set again, deliberately, by the
  // opening that moves the rebuilt economy onto the funded path.
  producerMarketLiveFromTurn: "",
  producerDemandPlanStage: "",
  producerSpilloverStage: "",
  producerSpilloverShare: "",
  producerPublicCarryStage: "",
  producerPublicCarryShare: "",
  producerRunPaceDrop: "",
  producerConversionPaceShare: "",
  producerHouseholdIncomeFloor: "",
  producerStockCover: "",
  producerClearingReferenceStage: "",
  producerFundedBookStage: "",
  producerProcurementSpillStage: "",
  producerProcurementSpillShare: "",
  producerShortageGrowthStage: "",
  producerCaptiveDeliveryStage: "",
  producerJointRunStage: "",
  producerFundedRestartStage: "",
  producerIdleRetireStage: "",
  decommissionGrantShare: "",
  producerLowUseCostStage: "",
  fundedOverheadStage: "",
  fundedHeadcountStage: "",
  equityCashoutLimitsStage: "",
  marketAdjustmentStage: "",
});

/**
 * Staged knobs the reset keeps, and why. Each is a market mechanic that is
 * true of every plants economy, not a steer applied to the old one.
 */
export const FRESH_PLANTS_CONFIG_KEPT: Readonly<Record<string, string>> = Object.freeze({
  commodityFixStage:
    "acts on the legacy warm-up turns only: it closes the formula-demand treadmill there; funded turns price by the funded rule (updateScarcityMultiplierFunded) regardless of the stage",
  strengthUpkeepStage: "plant strength upkeep is a standing cost rule",
  groupSizeCostsStage: "management overhead and concentration rules on groups",
  soeSizeCostScale: "state-owned size cost rule",
  dominanceRunningCostScale: "running dominance cost rule",
  honestBalanceSheetsStage: "debt counted in credit and share price",
  wholePlantsStage:
    "plants are whole units of capacity; a rebuilt economy keeps counting, building and wearing whole plants",
  managementOverheadPpPerDoubling: "management overhead rule",
  ceoSalaryVoteNetIncomeShare: "governance rule on CEO pay",
  commandEconomySecondEconomyTolerance: "era regime setting, rewritten per preset",
  producerShortageBuildFactor: "fresh-world setting written by the reset (FRESH_PLANTS_SETTINGS)",
  producerPriceMaxMove: "fresh-world setting written by the reset (FRESH_PLANTS_SETTINGS)",
  producerPriceMaxMultiplier: "fresh-world setting written by the reset (FRESH_PLANTS_SETTINGS)",
  marketGovernorRampTurns:
    "fresh-world setting written by the reset (FRESH_PLANTS_SETTINGS): the legacy-to-plants ramp is complete",
  producerTransitionPackageEnabled:
    "switched off explicitly by FRESH_PLANTS_INTERVENTIONS_OFF: a rebuilt economy gets no transition package",
  producerMarketShadowEnabled:
    "telemetry switch; the shadow must keep running so the rebuilt economy can be classified for its opening",
  economyPauseUntilTurn:
    "scheduled economy-only pause window: it describes the rebuilt world, not the economy being deleted, so the fresh-world update must not clear it",
});

/**
 * Automatic market interventions switched off for a rebuilt economy. Each one
 * was added to steer the old market from outside: the launch guard steps the
 * market tier down on a valuation drop (the governor family), and the four
 * Markets Watch programmes have index funds quote equities and absorb unheld
 * sovereign paper and have NPPs founded into thin markets by rule. A fresh
 * plants economy runs on its own rules; an operator may switch any of these on
 * later as a deliberate decision.
 */
const FRESH_PLANTS_INTERVENTIONS_OFF = Object.freeze({
  marketGuardEnabled: false,
  equityLiquidityFacilityEnabled: false,
  indexFundBondLiquidityEnabled: false,
  nppMarketCoverageEnabled: false,
  nppFragileMarketSupplyEnabled: false,
  // No transition package: a rebuilt economy has no over-built class to land.
  producerTransitionPackageEnabled: false,
} as const satisfies Partial<GameConfig>);

/**
 * Funded-market settings a rebuilt economy starts with (owner 2026-10-25,
 * chosen on the fresh-economy test arms: arm D grew every turn to 8.4M anchor
 * revenue by funded turn 23 with an 18% losing share and median prices 2.4x
 * base, where 6%/10x crashed mid-run and 3%/5x crashed by turn 8). A seeded
 * world starts far short of real demand: short plants build in a quarter of
 * the time, and prices move at most 2% a turn up to 3x.
 *
 * The legacy-to-plants governor ramp is finished on a rebuilt plants world
 * (owner 2026-10-30): a ramp of 1 turn. Unsetting it fell back to the 240-turn
 * default and brought the old running dominance tolls back.
 */
const FRESH_PLANTS_SETTINGS = Object.freeze({
  producerShortageBuildFactor: 0.25,
  producerPriceMaxMove: 0.02,
  producerPriceMaxMultiplier: 3,
  marketGovernorRampTurns: 1,
} as const satisfies Partial<GameConfig>);

/**
 * gameState turn anchors a fresh world sets to its first turn. On the kept
 * clock they restart at the reset turn so the phase-ins run from the rebuilt
 * economy's first turn, not from the old world's.
 */
export const FRESH_PLANTS_GAME_STATE_TURN_ANCHORS = Object.freeze([
  "hardwareInputReliefStartTurn",
  "stockHoldingTaxStartTurn",
] as const);

/** Central bank series written by the old economy's turns; chair, board and reserves stay. */
export const CENTRAL_BANK_HISTORY_RESET: Readonly<Record<string, unknown>> = Object.freeze({
  rateHistory: [],
  interestRateHistory: [],
  inflationHistory: [],
  gdpGrowthHistory: [],
  savingsFlowHistory: [],
  forexRevenue: 0,
  tradeGrowth: 0,
  // Savings accounts are wiped, so the bank owes households nothing on them.
  householdSavingsLiability: 0,
});

/**
 * The gameConfig write for a rebuilt economy: fresh-world gameplay flags on,
 * outside interventions off, the pricing phase-in restarted, and every
 * per-world stamp and staged knob gone. Ops keys (maintenance, webhooks,
 * registration) are untouched.
 */
export function freshPlantsGameConfigUpdate(): UpdateFilter<GameConfig> {
  return {
    $set: {
      ...FRESH_WORLD_GAME_CONFIG_FLAGS,
      ...FRESH_PLANTS_INTERVENTIONS_OFF,
      ...FRESH_PLANTS_SETTINGS,
      centralBankPricingPhaseIn: {},
    },
    $unset: {
      ...STALE_PER_WORLD_GAME_CONFIG_UNSET,
      ...STALE_MARKET_MODE_STAMP_UNSET,
      ...FRESH_PLANTS_CONFIG_UNSET,
    },
  };
}
