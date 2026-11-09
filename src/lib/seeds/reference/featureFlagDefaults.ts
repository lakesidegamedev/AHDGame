import type { GameConfig } from "@/lib/db/types/gameConfig";
import type { GameState } from "@/lib/db/types/gameState";

/**
 * Fresh-world feature flag policy.
 *
 * Every fresh world (bootstrap or reset) starts with every gameplay flag ON at
 * the top of its rollout ladder, except entries in FRESH_WORLD_FLAG_EXCLUSIONS
 * (NPP autonomy starts at v6, the live world's level). FeatureFlagDefaults.test.ts reads GameState and
 * GameConfig and fails when a flag is in neither preset nor the non-gameplay
 * lists, so new flags cannot ship silently.
 *
 * Applied by initializeGameState, resetGameWorld, and the reference gameConfig
 * seed. Running worlds are never flipped: seed top-ups use $setOnInsert only and
 * the reference-gate startup migration leaves post-first-day worlds alone.
 */

/** Gameplay flags held below their maximum on fresh worlds, and why. */
export const FRESH_WORLD_FLAG_EXCLUSIONS = {
  nppAutonomyLevel: {
    value: "v6",
    reason:
      "Fresh worlds seed NPP engine 6 (v6), the same level the live world runs. It is held as a named policy because it is a level, not an on/off flag.",
  },
} as const;

export const DEFAULT_GAME_STATE_FLAGS = {
  forexEnabled: true,
  playerRandomEventsEnabled: true,
  autoDisastersEnabled: true,
  sectorTechTreesEnabled: true,
  nppAutonomyLevel: FRESH_WORLD_FLAG_EXCLUSIONS.nppAutonomyLevel.value,
  // Kept in sync with nppAutonomyLevel for legacy readers.
  nppAutonomyEnabled: true,
  // NPP death and retirement, independent of the autonomy level.
  nppTurnoverEnabled: true,
  // NPP parties splinter, found and fold; bounds the seat-share ratchet.
  nppPartyRenewalEnabled: true,
  nppForeignPolicyMode: "active",
  nppForeignPolicyStage: "war",
  // The reset-era systems are staged independently. These are version
  // selectors.
  metricsSystemVersion: "v1",
  legislationSystemVersion: "v1",
  cabinetSystemVersion: "v1",
  eraSystemEnabled: true,
  livingConflictsEnabled: true,
  coldWarEnabled: true,
  nppEntryViabilityMode: "enforce",
  frontierEntryExperimentEnabled: true,
  nppCorpStrategyEnabled: true,
  // Macro demand reads state GDP in anchor terms. Fresh worlds only: existing
  // worlds lack the field and keep the raw stored reading.
  stateGdpAnchoredDemand: true,
} as const satisfies Partial<GameState>;

export type DefaultGameStateFlagKey = keyof typeof DEFAULT_GAME_STATE_FLAGS;

/** Gameplay gates and rollout modes on `gameConfig` for every fresh world. */
export const FRESH_WORLD_GAME_CONFIG_FLAGS = {
  nppEconomyEnabled: true,
  nppCorpsAttackable: true,
  nppFundRedemptionEnabled: true,
  nppMarketCoverageEnabled: true,
  nppFragileMarketSupplyEnabled: true,
  lineOfCreditEnabled: true,
  moneySupplyEnabled: true,
  indexFundsMode: "full",
  indexFundBondLiquidityEnabled: true,
  equityLiquidityFacilityEnabled: true,
  labourSystemMode: "full",
  marketSystemMode: "plants",
  freightSettlementMode: "active",
  canonicalFreightBillingEnabled: true,
  interstateMoneyWiringEnabled: true,
  shortageResponsiveSourcingEnabled: true,
  commodityScarcityDriftEnabled: true,
  stockCoverCapEnabled: true,
  extractionOutputScaleEnabled: true,
  qualityPremiumPricingEnabled: true,
  sectorQualityEnabled: true,
  brandLoyaltyEnabled: true,
  brandLoyaltySliceEnabled: true,
  supplyAgreementsEnabled: true,
  groupSupplyCoordinationEnabled: false,
  explicitPlantCostsEnabled: true,
  householdConsumptionEnabled: true,
  productLinesV2Enabled: true,
  mediaProductSlatesEnabled: true,
  mediaEditorialEnabled: true,
  mediaOperatingModelsEnabled: true,
  mediaRegulationEnabled: true,
  politicalMediaMarketEnabled: true,
  privateBankingEnabled: true,
  bankPropTradingEnabled: true,
  bankContagionEnabled: true,
  bankConstructionFinanceEnabled: true,
  treasuryCashLedgerEnabled: true,
  sovereignIssuanceConsolidationEnabled: true,
  sovereignRolloverConsolidationEnabled: true,
  sovereignCouponGroupedAccrualEnabled: true,
  domesticSovereignBondCoverageEnabled: true,
  prospectingEnabled: true,
  contractIssuanceEnabled: true,
  campaignEraPriceLevelEnabled: true,
  regionalConditionsOverviewEnabled: true,
  firstJoinerBecomesPartyChair: true,
  // Import tariffs in the funded producer market. Fresh worlds only: a running
  // world switches it on as a deliberate staged change.
  producerTariffStage: 1,
  // Growth signal measured as value added. A running world keeps gross output
  // so a basis switch cannot show up as a recession.
  outputBasis: "value_added",
  // Operational switches for systems that change a running world. A running
  // world has them absent (off) until an operator turns them on.
  priceLevelEnabled: true,
  fiscalStabilizerEnabled: true,
  crisisV2EmergentEnabled: true,
} as const satisfies Partial<GameConfig>;

export type FreshWorldGameConfigFlagKey = keyof typeof FRESH_WORLD_GAME_CONFIG_FLAGS;

/** gameState fields shaped like flags that this policy deliberately does not set. */
export const NON_GAMEPLAY_GAME_STATE_FIELDS: Readonly<Record<string, string>> = {
  isActive: "runtime state: the turn cron runs only after an admin starts the world",
  isProcessing: "runtime state: turn lock",
  startingPartiesMode: "reset option chosen per reset, not a feature",
  wikiDisabled: "ops access gate for the wiki",
  corporationActionsPaused: "ops kill switch for corporate actions",
  playerTransfersPaused: "ops kill switch for player transfers",
  defenceProcurementPaused: "ops kill switch for defence procurement",
  autoCrisisPaused: "ops pause switch; the crisis system itself is on",
  freePartyMovesOpen: "launch window state opened and closed by an admin",
  fastMode: "turn cadence, not a feature",
  eurozoneEnabled: "era-derived: seedForex sets it per preset (no euro before 1999)",
};

/** gameConfig fields shaped like flags that this policy deliberately does not set. */
export const NON_GAMEPLAY_GAME_CONFIG_FIELDS: Readonly<Record<string, string>> = {
  maintenanceMode: "ops maintenance switch",
  producerMarketShadowEnabled:
    "telemetry only: runs the unified producer market in memory beside the live engine; changes no gameplay",
  producerTransitionPackageEnabled:
    "cutover switch: absent means the transition package runs as today; the economy-only reset writes it off because a rebuilt economy has nothing to land softly",
  pollBannerEnabled: "ops announcement banner",
  sandboxTesterAccessEnabled: "ops access gate for sandbox tester grants (no supporter perks)",
  publicReviewMode: "ops access gate for anonymous page reads",
  publicViewingMode: "ops access gate for anonymous API reads",
  testMode: "ops registration gate",
  adminRegistrationEnabled: "security: admin registration side channel",
  registrationEnabled: "ops kill switch for new registrations",
  governmentContractsEnabled: "ops kill switch for government contracts; absent defaults open",
  discordLinkRequiredForCharacter:
    "ops character-creation gate; absent defaults off and an operator-enabled requirement survives world resets",
  ipCollisionCheckEnabled: "security tooling",
  ipDetectionEnabled: "security tooling (third-party IP lookups)",
  auditLog: "security forensics tooling",
  altScoringEnabled: "security forensics tooling",
  marketGuardEnabled: "automated safety kill switch; keeps its reference default (armed)",
  ledgerShadow: "internal reconciliation observer; keeps its reference default (on)",
  simSandbox: "sim harness only, never set on a hosted world",
  simTurnPhaseMode: "sim harness only, never set on a hosted world",
  bankConstructionAdmissionClosing: "runtime state: admission close latch",
  savingsAccountsMode:
    "storage migration (legacy fields to account rows) driven cohort by cohort from the banking rollout route, not a gameplay feature",
  indexFundsEnabled: "deprecated alias of indexFundsMode",
  commandEconomyEnabled:
    "era-derived: bootstrap sets it from the preset (on for 1953 and 1979 command regimes)",
  demographicsDemandEnabled:
    "superseded alternative to householdConsumptionEnabled; enabling both double-counts consumer demand",
  marketGovernorGlideMode:
    "operator transition control for one world's launch-governor glide, set with its start turn; fresh worlds have no glide",
};

/**
 * Subset of DEFAULT_GAME_STATE_FLAGS that is missing (undefined) on `existing`.
 * Used by sim tooling that replays existing-world upgrades; a reset applies the
 * full preset instead. The NPP-autonomy pair is treated as one flag: if either
 * the level or the legacy boolean has been set, neither default is applied.
 */
export function missingGameStateFlagDefaults(
  existing: Partial<GameState> | null | undefined
): Partial<GameState> {
  const out: Record<string, unknown> = {};
  const nppTouched =
    existing?.nppAutonomyLevel !== undefined || existing?.nppAutonomyEnabled !== undefined;
  for (const [key, value] of Object.entries(DEFAULT_GAME_STATE_FLAGS)) {
    if (key === "nppAutonomyLevel" || key === "nppAutonomyEnabled") {
      if (!nppTouched) out[key] = value;
      continue;
    }
    if (existing?.[key as keyof GameState] === undefined) out[key] = value;
  }
  return out as Partial<GameState>;
}

/**
 * Split a gameConfig update into fields every seed run may write and the
 * fresh-world flag fields, which a non-reset top-up must only insert so it
 * never flips a running world.
 */
export function splitFreshWorldGameConfigFlags<T extends object>(
  config: T
): { settings: Record<string, unknown>; flags: Record<string, unknown> } {
  const settings: Record<string, unknown> = {};
  const flags: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (key in FRESH_WORLD_GAME_CONFIG_FLAGS || key in NON_GAMEPLAY_GAME_CONFIG_FIELDS) {
      flags[key] = value;
    } else {
      settings[key] = value;
    }
  }
  return { settings, flags };
}
