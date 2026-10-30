import type { Filter, ObjectId } from "mongodb";
import type {
  CorporationType,
  OperatingSectorType,
  ManufacturingIndustryModel,
} from "@/lib/constants/corporations";
import type { MediaDiscriminator } from "@/lib/constants/corporations";
import type { CommodityType } from "@/lib/constants/commodities";
import type { CommodityDominanceSector } from "@/lib/corporations/rules/commodityDominance";
import type { Corporation, CorporateSector, SectorBuildOrder } from "@/lib/db/types";
import type { CeoArchetypeModifiers } from "@/lib/turn/ceoArchetype";
import type { NppStrategyState } from "./corpStrategy";
import type { NppMarketEntryDiagnostic } from "./entryDiagnostics";
import type { FrontierEntryTurnState } from "./frontierEntryCandidate";
import type { CapacityDecisionObservation } from "@/lib/corporations/capacityDecisionTelemetry/rules";
import type { NppOperatorObservation } from "@/lib/corporations/nppOperatorTelemetry/rules";

export interface NppCorpDecisionContext {
  /** Validated current group direction; absent preserves autonomous behavior. */
  groupDirection?: import("@/lib/corporations/groups/managementTypes").GroupDirection;
  groupRootId?: string;
  corp: Corporation;
  sectors: CorporateSector[];
  turn: number;
  now: Date;
  /** Behavior modifiers derived from the CEO NPP personality. */
  modifiers: CeoArchetypeModifiers;
  /** Local units per anchor unit for the corporation liquid currency. */
  fxRate?: number;
  /** Live local-per-anchor rates used to restate host-currency sector revenue. */
  fxByCurrency?: ReadonlyMap<string, number>;
  /** Whether the labour system permits wage-level writes. */
  labourWagesEnabled?: boolean;
  currentYear?: number;
  techTreesEnabled?: boolean;
  /** The corp's country runs NPP engine 6 (autonomy v6); absent reads as engine 5. */
  engineSix?: boolean;
  /** Net per-turn debt service in anchor currency; positive is a drag. */
  debtServiceAnchor?: number;
  /** Persisted strategy memory; absent adopts the legacy expand behavior. */
  strategy?: NppStrategyState;
  strategyEligible?: boolean;
  ordinaryEntryEligible?: boolean;
  /**
   * Widened cohort slot used only when the entry target is logistics in a
   * critical freight shortage. Absent reads as the ordinary slot.
   */
  criticalLogisticsEntryEligible?: boolean;
  /** Same widened slot, minus autopilot corporations, which never borrow. */
  criticalLogisticsShortageEligible?: boolean;
  strategyLoopEnabled?: boolean;
  /**
   * Capped frontier-entry experiment state (issue #991), supplied by the turn
   * shell only when `frontierEntryExperimentEnabled` resolves true. The sets
   * are shared across the whole NPP cohort for the turn and enforce at most
   * one entrant per state-country cohort and one per controlling entity.
   * Absent (or disabled) reads as off and the decision is byte-identical to
   * the legacy path.
   */
  frontierEntry?: FrontierEntryTurnState;
  shortageEntryEligible?: boolean;
  shortageEntryCreditLocal?: number;
  /** Pause new Retail entry/growth while fake supply-derived demand unwinds. */
  retailExpansionPaused?: boolean;
  /**
   * In-memory rival count per (state, sectorType) bucket, excluding the
   * deciding corporation itself. Supplied by the turn shell from data it
   * already holds; absent reads as 0 so pure unit tests stay db-free.
   */
  competitorCountOf?: (stateId: string, sectorType: string, ownCorporationId: string) => number;
  /**
   * Growth multiplier (>= 1) for this corporation in a sector type one firm
   * dominates; 1 for the sector leader and healthy sectors. Absent reads as 1.
   */
  challengerBoostOf?: (sectorType: string, ownCorporationId: string) => number;
  /** Resolved NPP operator permissions; absent derives them from the corporation. */
  operator?: import("./rules/operatorPolicy").OperatorPermissions;
  /**
   * First funded turn of the world's market transition (opening turn + 1);
   * absent before the funded market or outside a funded world.
   */
  transitionFirstFundedTurn?: number;
  /** Per-country allowance of capacity that may start converting this turn; absent = unpaced. */
  conversionBudgetOf?: (
    countryId: string
  ) => import("@/lib/market/producerMarket/transitionRules").ConversionBudget | undefined;
  /** Funded shortage for a recipe (sector type and strategy); absent = funded restart off. */
  fundedRestartPressureOf?: (
    sectorType: string,
    strategyId: string | null | undefined
  ) => number | undefined;
  /** Player-appointed caretaker mandate. NPP-owned corporations are always active. */
  caretakerMandate?: "active" | "passive";
  /**
   * Unowned-pool lookup shared across the whole cohort. The index it builds is a
   * pure function of the pool snapshot, which every corporation's decision in
   * one turn reads unchanged, so it is built once instead of once per
   * corporation. Absent builds a private one.
   */
  reinvestPoolFor?: import("./reinvestCandidatePool").ReinvestPoolLookup;
}

/** A composable sector write emitted by the NPP corporation decision engine. */
export type NppSectorUpdateDoc = {
  $set: Record<string, unknown>;
  $push?: Record<string, unknown>;
  $inc?: Record<string, number>;
};

export interface NppCorpDecision {
  corpId: ObjectId;
  /** Capacity book a conversion in this decision consumes from its country's pacing allowance; charged by the caller once the decision is final. */
  conversionCharge?: { countryId: string; cost: number };
  /** Situation flags a player-owned autopilot corp turns into owner advisories. */
  autopilotSignals?: {
    chronicLowFill: boolean;
    debtDominant: boolean;
    /** Sectors the brain would have divested; autopilot keeps them. */
    losingSectors: number;
  };
  /**
   * Non-cash field writes only. `liquidCapital` MUST NOT appear here — the NPP
   * ops are appended to the corporation bulkWrite AFTER this turn's income
   * `$inc`, so an absolute write of the balance overwrites the credit. See
   * `liquidCapitalDelta` and `nppCashWrite.ts` (ticket #1260).
   */
  updates: Record<string, unknown>;
  /**
   * Net change to `liquidCapital` this decision causes, in the corp's own
   * currency: negative for spending, 0 when the corp spent nothing. Emitted as
   * `$inc` so it composes with the income credit instead of racing it.
   */
  liquidCapitalDelta: number;
  /** Local-currency cash floor that later NPP operator passes must preserve. */
  cashFloorLocal: number;
  /** Exact total founding charge, separate from any reinvestment or borrowed cash. */
  foundingCashLocal?: number;
  sectorUpdates: Array<{
    filter: Filter<CorporateSector> & { _id: ObjectId };
    update: NppSectorUpdateDoc;
  }>;
  newSectors?: Array<{
    stateId: string;
    countryId: string;
    sectorType: CorporationType;
    industryModel?: ManufacturingIndustryModel | null;
    mediaDiscriminator?: MediaDiscriminator | null;
    revenue: number;
    profitMargin: number;
    strategyId?: string;
    starterOrder?: SectorBuildOrder;
  }>;
  divestedSectorIds?: ObjectId[];
  unownedDraws?: Array<{
    stateId: string;
    sectorType: CorporationType;
    industryModel?: ManufacturingIndustryModel | null;
    mediaDiscriminator?: MediaDiscriminator | null;
    units: number;
    countryId: string;
  }>;
  strategy?: NppStrategyState;
  reinvestments?: Array<{
    sectorId: ObjectId;
    sectorType: CorporationType;
    industryModel?: ManufacturingIndustryModel | null;
    mediaDiscriminator?: MediaDiscriminator | null;
    units: number;
    costAnchor: number;
    costLocal: number;
    onlineTurn: number;
  }>;
  /** Cash-ineligible private-sector reinvestment candidates for optional bank finance. */
  constructionFinanceIntents?: Array<{
    sector: CorporateSector;
    order: SectorBuildOrder;
    costLocal: number;
    cashContributionLimitLocal: number;
    /** New-market portion of this order; replacements do not consume unowned headroom. */
    growthUnits: number;
    priority: number;
    fill: number;
  }>;
  shortageCreditRequest?: {
    amountLocal: number;
    sectorType: OperatingSectorType;
  };
  entryDiagnostic?: NppMarketEntryDiagnostic;
  /**
   * Capacity-decision telemetry for this corp this turn: one founding
   * observation plus one per evaluated reinvestment candidate, in that order.
   * Aggregated and flushed by the turn shell in a single bulk write.
   */
  capacityObservations?: CapacityDecisionObservation[];
  /** Aggregate-safe summary of this turn's full NPP operator decision. */
  operatorObservation?: NppOperatorObservation;
}

/** World facts needed to price founding builds through the player-equivalent path. */
export interface NppPlantsContext {
  enabled: boolean;
  /** gameConfig.wholePlantsStage on: builds are sized in whole plants. */
  wholePlants?: boolean;
  year: number;
  eraUnitScale: number;
  preset: string | undefined;
  primeRateOf: (countryId: string) => number;
  costOfLivingOf: (stateId: string) => number | null;
  /**
   * World demand (units/day) for a commodity, from the lagged price book, or
   * null when unknown. Feeds the commodity-level build toll so an NPP prices
   * capacity the way a player does.
   */
  commodityDemandOf?: (commodity: CommodityType) => number | null;
  /**
   * Every sector of a corporation's control group as dominance sectors, set
   * once the group toll stage is on. Absent = price on the corporation alone.
   */
  groupDominanceSectorsOf?: (corporationId: string) => CommodityDominanceSector[];
  /** `gameConfig.commandEconomyEnabled`, for the planned-economy output remap. */
  commandEconomyEnabled?: boolean;
  /** Aggregate corporation share of one (country, sectorType) market. */
  nationalShareOf?: (
    corporationId: ObjectId,
    countryId: string,
    sectorType: CorporationType,
    industryModel?: string | null,
    mediaDiscriminator?: MediaDiscriminator | null
  ) => number;
}
