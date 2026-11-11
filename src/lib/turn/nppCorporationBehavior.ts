import { recipeKey } from "@/lib/market/producerMarket/fundedRestartRules";
import {
  resolveShortageGrowthFinanceConfig,
  sectorBookPressure,
  shortageGrowthCashContributionLimit,
  type ShortageGrowthFinanceConfig,
  type ShortageGrowthFinanceConfigInput,
} from "@/lib/turn/npp/rules/shortageGrowthFinance";
import { wholePlantsOn } from "@/lib/corporations/wholePlants/rules";
import { loadGroupDirectionMembership } from "./npp/groupDirectionMembership";
/**
 * NPP corporation decisions use shared market and funding observations.
 * processNppCorporationDecisions loads them and prepares corporation and sector writes.
 */
import {
  chargeConversionBudget,
  conversionBudgets as buildConversionBudgets,
} from "@/lib/market/producerMarket/transitionRules";
import {
  challengerBoost,
  computeSectorConcentration,
} from "@/lib/turn/npp/rules/sectorConcentration";
import { makeNppCorpDecision } from "@/lib/turn/npp/makeCorpDecision";
import { stateServiceHeadroomOn } from "@/lib/turn/npp/rules/stateServiceHeadroom";
import { liftStateServiceHeadroom } from "@/lib/turn/npp/stateServiceHeadroomShell";
import { strategyStateNeedsPersist } from "@/lib/turn/npp/rules/strategyCadence";
export { makeNppCorpDecision } from "@/lib/turn/npp/makeCorpDecision";
import {
  buildNppDecisionCashWrites,
  type NppFoundingCashWitness,
} from "@/lib/turn/npp/foundingCashLedger";
import type { Db, ObjectId } from "mongodb";
import type { Corporation, CorporateSector, ExchangeRate, State } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { currencyForCountry } from "@/lib/currency/sectorFxSpread";
import { netPerTurnDebtServiceAnchor } from "@/lib/bonds/corpBondCashflows";
import {
  buildActiveMarketBuckets,
  createPlacementSectorFacts,
  markMarketsActive,
} from "@/lib/turn/npp/marketSignals";

export {
  sectorShortageScore,
  computeMacroProductionPolicy,
  type CommodityPriceRatioFn,
} from "@/lib/turn/npp/marketSignals";

import { criticalLogisticsStaggerEligible, glutStaggerEligible } from "@/lib/turn/npp/cohort";

export { GLUT_STATE_CHANGE_STAGGER, glutStaggerEligible } from "@/lib/turn/npp/cohort";
export {
  STRATEGY_SHIFT_MARGIN_TRIGGER,
  STRATEGY_SHIFT_MIN_ADVANTAGE,
  STRATEGY_SHIFT_PROFIT_SEEK_ADVANTAGE,
  strategyPriceScore,
} from "@/lib/turn/npp/strategyRetooling";
import type { UnownedSector } from "@/lib/db/types/unownedSector";
import { ceoArchetypeModifiers } from "@/lib/turn/ceoArchetype";
import {
  buildNppCorporationDecisionIndexes,
  indexOpenUnownedSectors,
  nppDecisionCohortIds,
} from "@/lib/turn/npp/decisionSnapshotIndexes";

import { partitionOpenMarkets } from "@/lib/economy/queries/privateEnterpriseGate";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import type { ManufacturingProductProject } from "@/lib/products/manufacturingProject";

import { labourAtLeast, isLabourSystemMode } from "@/lib/labour/modes";

import {
  bucketKey,
  computeStateControlledBuckets,
  loadNationalCorpIds,
} from "@/lib/nationalization/stateControlledBuckets";

import { STARTING_YEAR, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  foundingInputAvailability,
  type FoundingRecipeWorld,
} from "@/lib/turn/npp/foundingRecipeChoice";

import { loadGroupDominanceSectorResolver } from "@/lib/corporations/groupDominanceSectors";
import type { BuildCapexTxInput } from "@/lib/corporations/capexTxLog";

import { buildNppNationalShareResolver } from "@/lib/turn/npp/nationalDominancePricing";
import { resolvePresetIdFromGameState } from "@/lib/world/presetId";
import { buildNppPriceSignals } from "@/lib/turn/npp/priceSignals";
import type { RelocationPrimeBank } from "@/lib/corporations/issueRelocationBond";
import { loadNppBankRateSnapshot } from "@/lib/turn/npp/bankRateSnapshot";
import {
  buildNppProductProjectsV2,
  loadNppCostOfLivingByState,
  loadNppProductProjectsV2,
} from "@/lib/turn/npp/manufacturingProducts";

import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import type { CapacityDecisionObservation } from "@/lib/corporations/capacityDecisionTelemetry/rules";
import { type NppOperatorObservation } from "@/lib/corporations/nppOperatorTelemetry/rules";
import {
  buildCapacityCompetitorIndex,
  makeCapacityCompetitorCounter,
  mergeCapacityObservations,
} from "@/lib/turn/npp/capacityDecisionTelemetry";

import type { NppCorpUpdateOp } from "./npp/nppCashWrite";
import type { NppReinvestmentCashWitness } from "./npp/reinvestmentCashLedger";

import {
  drawFoundedCapacityFromPools,
  flushNppCapacityWriteback,
} from "@/lib/turn/npp/capacityWriteback";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";

import { loadNppBehaviorConfig } from "@/lib/turn/npp/behaviorConfig";
import { nppAutonomyAtLeast, withNppAutonomySnapshot } from "@/lib/nppAutonomy/featureFlag";
import { NPP_ENGINE_LEVEL } from "@/lib/nppAutonomy/engineVersion";
import {
  boundNppConstructionFinanceCandidates,
  boundNppShortageGrowthFinanceCandidates,
  loadNppConstructionFundingPool,
  NPP_CONSTRUCTION_FINANCE_TERM_TURNS,
  selectNppConstructionFundingContext,
  type NppConstructionFinanceCandidate,
  type NppConstructionFinanceRequest,
} from "@/lib/turn/npp/nppConstructionFinance";
import { maybePushNppTechUnlock } from "@/lib/turn/npp/corpBehaviorConfig";
import {
  AUTOPILOT_ADVISORY_COPY,
  AUTOPILOT_MODIFIERS,
  advisoriesChanged,
  deriveAutopilotAdvisories,
  advisoriesToNotify,
  isAutopilotRun,
} from "@/lib/corporations/autopilot";
import type { CorpAutopilotAdvisory } from "@/lib/db/types/corporation";
import { operatorPermissionsFor } from "@/lib/turn/npp/operatorPermissions";
import { operatorMay } from "@/lib/turn/npp/rules/operatorPolicy";
import { createNotifications } from "@/lib/notifications";
import {
  corpDailyGrossRevenueLocalFromSectors,
  corpTechPlantBasisFromSectors,
  corpTechCashFloorLocal,
} from "@/lib/corporations/dailyGrossRevenue";
import type { TechUnlockLedgerInput } from "@/lib/corporations/techTree/techUnlockLedger";
import { loadTechDiffusionSnapshot } from "@/lib/corporations/techTree/diffusion";
import {
  presetUsesTechDiffusion,
  type TechDiffusionSnapshot,
} from "@/lib/constants/techTree/diffusion";
import { loadFrontierResearchByLane } from "@/lib/corporations/techTree/frontierResearch";
import { loadNppPlacementSignals } from "@/lib/turn/npp/fragileMarketSupply";
import {
  buildMarketSaturationIndex,
  canFoundAsBuilder,
  cellUnmetDemandUnits,
  marketSaturationOf,
} from "@/lib/turn/npp/rules/marketSaturation";
import { getOperatingSectorType, getStrategy } from "@/lib/constants/sectorStrategies";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import {
  resolveNppMarketEntryCredit,
  setNppMarketEntryReason,
  type NppMarketEntryDiagnostic,
} from "@/lib/turn/npp/entryDiagnostics";
import { createRelocationCreditBatch } from "@/simulation/engine/v2/relocationCreditBatch";

import { createFrontierEntryTurnState } from "@/lib/turn/npp/frontierEntryCandidate";
import type {
  NppCorpDecision,
  NppCorpDecisionContext,
  NppPlantsContext,
  NppSectorUpdateDoc,
} from "@/lib/turn/npp/corpDecisionTypes";
import {
  loadNppCorporationBondLookups,
  type NppCorporationDecisionPreload,
} from "@/lib/turn/npp/nppCorporationBondLookups";
export type { NppPlantsContext } from "@/lib/turn/npp/corpDecisionTypes";

export { computeExtractionHeadroomByState } from "@/lib/turn/nppExtractionOpportunity";

import {
  NPP_GROWTH_MIN_SHORTAGE,
  NPP_GROWTH_MIN_UTILIZATION,
  NPP_GROWTH_MAX_STEP_OF_RUN,
  NPP_SHORTAGE_ENTRIES_PER_TURN,
  NPP_FOUNDING_DEPLOY_FRACTION,
  NPP_FOUNDING_HEADROOM_SHARE,
  DEFAULT_ARCHETYPE,
} from "@/lib/turn/npp/nppCorporationTuning";
import { SETTLEMENT_HISTORY_EXCLUDED } from "@/lib/banking/settlementHistory";
import { createReinvestPoolLookup } from "@/lib/turn/npp/reinvestCandidatePool";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getCorporateSectorsCollection } from "@/lib/db/collections/corporateSectors";
import { getNppsCollection } from "@/lib/db/collections/npps";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { getStatesCollection } from "@/lib/db/collections/states";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { unownedSectorsCollection } from "@/lib/db/repositories/unownedSectors";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";

export {
  NPP_GROWTH_MIN_SHORTAGE,
  NPP_GROWTH_MIN_UTILIZATION,
  NPP_GROWTH_MAX_STEP_OF_RUN,
  NPP_SHORTAGE_ENTRIES_PER_TURN,
  NPP_FOUNDING_DEPLOY_FRACTION,
  NPP_FOUNDING_HEADROOM_SHARE,
};

export async function processNppCorporationDecisions(
  db: Db,
  turn: number,
  now: Date,
  techTreesEnabled: boolean = false,
  preloaded?: NppCorporationDecisionPreload
): Promise<{
  corpUpdates: NppCorpUpdateOp[];
  sectorUpdates: Array<{
    filter: { _id: ObjectId };
    update: NppSectorUpdateDoc;
  }>;
  newSectors: Array<Omit<CorporateSector, "_id"> & { _id: ObjectId }>;
  divestedSectorIds: ObjectId[];
  techLedger: TechUnlockLedgerInput[];
  foundingCashWitnesses?: NppFoundingCashWitness[];
  reinvestmentCashWitnesses?: NppReinvestmentCashWitness[];
  manufacturingProductProjects: ManufacturingProductProject[];
  constructionFinanceRequests: NppConstructionFinanceRequest[];
  constructionFinanceCandidateCount: number;
  constructionFinanceBacklogCount: number;
}> {
  // Player corps on autopilot ride the same brain; see isAutopilotRun.
  const nppCorps = preloaded
    ? preloaded.corporations.filter(
        (corp) => (corp.ceoType === "npp" && corp.suspended !== true) || isAutopilotRun(corp)
      )
    : (
        await (
          await getCorporationsCollection(db)
        )
          .find(
            {
              $or: [
                { ceoType: "npp", suspended: { $ne: true } },
                { autopilot: { $exists: true }, suspended: { $ne: true } },
              ],
            },
            { projection: SETTLEMENT_HISTORY_EXCLUDED }
          )
          .toArray()
      ).filter((corp) => corp.ceoType === "npp" || isAutopilotRun(corp));

  const corpUpdates: NppCorpUpdateOp[] = [];
  const allSectorUpdates: Array<{
    filter: { _id: ObjectId };
    update: NppSectorUpdateDoc;
  }> = [];
  const newSectors: Array<Omit<CorporateSector, "_id"> & { _id: ObjectId }> = [];
  const allDivestedSectorIds: ObjectId[] = [];
  const techLedger: TechUnlockLedgerInput[] = [];
  const foundingCashWitnesses: NppFoundingCashWitness[] = [];
  const decisionCashOps: NppCorpUpdateOp[] = [];
  const operatorObservations: NppOperatorObservation[] = [];

  if (nppCorps.length === 0)
    return {
      corpUpdates,
      sectorUpdates: allSectorUpdates,
      newSectors,
      divestedSectorIds: allDivestedSectorIds,
      techLedger,
      manufacturingProductProjects: [],
      constructionFinanceRequests: [],
      constructionFinanceCandidateCount: 0,
      constructionFinanceBacklogCount: 0,
    };

  const { corporationIds: corpIds, ceoNppIds } = nppDecisionCohortIds(nppCorps);
  // All four reads depend only on the NPP cohort. Start them together rather
  // than making the decision phase wait for each collection in sequence.
  const [allSectors, ceoNpps, commodityPriceDocs, unownedSectors] = await Promise.all([
    // full-read(corporateSectors): buildQueue and plantsPnl drive NPP build and divest decisions
    (await getCorporateSectorsCollection(db)).find({ corporationId: { $in: corpIds } }).toArray(),
    ceoNppIds.length > 0
      ? (await getNppsCollection(db))
          .find({ _id: { $in: ceoNppIds } }, { projection: { personality: 1 } })
          .toArray()
      : Promise.resolve([]),
    commodityPricesCollection(db).find({}).toArray(),
    unownedSectorsCollection(db).find({}).toArray(),
  ]);
  const { archetypeByNppId, sectorsByCorp, priceByCommodity } = buildNppCorporationDecisionIndexes(
    ceoNpps,
    allSectors,
    commodityPriceDocs
  );
  const { priceRatioOf, statePriceRatioOf, stateDemandOf, stateInputAvailabilityOf } =
    buildNppPriceSignals(priceByCommodity);

  const placementSignals = await loadNppPlacementSignals(db, turn, allSectors, statePriceRatioOf);
  placementSignals.stateDemandOf = stateDemandOf;
  placementSignals.stateInputAvailabilityOf = stateInputAvailabilityOf;
  // The whole cohort ranks the same unowned snapshot, so the price-derived
  // shortage scores are resolved once for the turn instead of per corp. Market
  // size stays live inside the scan: founding draws move it during the pass.
  placementSignals.sectorFacts = createPlacementSectorFacts();

  const { open: openUnowned, blocked } = await partitionOpenMarkets(db, unownedSectors);

  const { unownedByCountry, unownedIndex } = indexOpenUnownedSectors(openUnowned);

  // NPPs cannot auto-expand into state-controlled buckets; players still may.
  const [nationalCorpIds, globalSectors, strategyGate] = await Promise.all([
    loadNationalCorpIds(db),
    (await getCorporateSectorsCollection(db))
      .find(
        {},
        {
          projection: {
            stateId: 1,
            countryId: 1,
            sectorType: 1,
            // Lane identity: without these an entertainment or vehicles sector
            // keys as plain media/manufacturing, so its bucket never reads as
            // covered or state-controlled.
            industryModel: 1,
            mediaDiscriminator: 1,
            revenue: 1,
            corporationId: 1,
            nationalizedAtTurn: 1,
            mothballed: 1,
            // Where each method already runs, for technology diffusion.
            strategyId: 1,
            capitalStock: 1,
            // Physical saturation per cell: see rules/marketSaturation.
            demandThrottleFactor: 1,
            // Funded worlds read sell-through from the receipt instead.
            "producerSettlement.worldEpoch": 1,
            "producerSettlement.offeredUnits": 1,
            "producerSettlement.soldUnits": 1,
          },
        }
      )
      .toArray(),
    // Cohort-wide kill switch, read once. Absent means ON.
    (await getGameStateCollection(db)).findOne(
      { _id: "current" },
      {
        projection: {
          nppCorpStrategyEnabled: 1,
          frontierEntryExperimentEnabled: 1,
          worldEpochId: 1,
          producerOpening: 1,
          currentYear: 1,
          startingYear: 1,
          currentTurn: 1,
          preset: 1,
        },
      }
    ),
  ]);
  // Funded-market transition window, for AI use of the free conversion.
  const transitionFirstFundedTurn =
    strategyGate?.producerOpening &&
    strategyGate.producerOpening.worldEpoch === strategyGate.worldEpochId
      ? strategyGate.producerOpening.turn + 1
      : undefined;
  // The funded world's epoch: NPP demand readings use funded sell-through there.
  const fundedWorldEpoch =
    transitionFirstFundedTurn != null ? (strategyGate?.worldEpochId ?? undefined) : undefined;
  const stateControlled = computeStateControlledBuckets(globalSectors, nationalCorpIds);
  placementSignals.activeMarketBuckets = buildActiveMarketBuckets(globalSectors);
  const saturationIndex = buildMarketSaturationIndex(globalSectors, fundedWorldEpoch);
  // The index is a snapshot of this turn's sectors and nothing in the pass
  // writes it, so a cell's saturation is one number for the whole cohort. The
  // entry scan asks for it on every candidate of every corporation. The
  // `excluding` form is a single plant's own view and stays uncached.
  const saturationByCell = new Map<string, number | null>();
  placementSignals.marketSaturationOf = (cell, excluding) => {
    if (excluding) return marketSaturationOf(saturationIndex, cell, excluding, fundedWorldEpoch);
    const key = bucketKey(
      cell.stateId,
      cell.sectorType,
      cell.industryModel,
      cell.mediaDiscriminator
    );
    const cached = saturationByCell.get(key);
    if (cached !== undefined) return cached;
    const value = marketSaturationOf(saturationIndex, cell);
    saturationByCell.set(key, value);
    return value;
  };
  // Last turn's state and national books, already loaded as price docs.
  // Same-type NPP builders per country, for the essential-shortage valve.
  const sameTypeNpp = new Set<string>();
  for (const corp of nppCorps) {
    if (
      !canFoundAsBuilder({
        ceoType: corp.ceoType,
        autopilotRun: isAutopilotRun(corp),
        suspended: corp.suspended,
        liquidCapital: corp.liquidCapital,
        strategyId: corp.nppStrategy?.id,
      })
    ) {
      continue;
    }
    sameTypeNpp.add(`${corp.countryId}|${corp.type}`);
    if (corp.secondaryType) sameTypeNpp.add(`${corp.countryId}|${corp.secondaryType}`);
  }
  placementSignals.hasSameTypeNppIn = (countryId, sectorType) =>
    sameTypeNpp.has(`${countryId}|${sectorType}`);
  placementSignals.unmetDemandUnitsOf = (cell, options) => {
    // The mix the new plant would actually run: its founding strategy, else the
    // sector default (getStrategy falls back to it).
    const supplyMix = getStrategy(
      getOperatingSectorType(cell.sectorType, cell.industryModel, cell.mediaDiscriminator),
      options?.strategyId ?? ""
    ).supply;
    return cellUnmetDemandUnits({
      supplyMix,
      aggregate: options?.aggregate,
      gapFor: (commodity) => {
        const doc = priceByCommodity.get(commodity);
        if (!doc) return null;
        const [supply, demand] = isStateScopedCommodity(commodity)
          ? [doc.stateSupply?.[cell.stateId], doc.stateDemand?.[cell.stateId]]
          : [doc.nationalSupply?.[cell.countryId], doc.nationalDemand?.[cell.countryId]];
        if (typeof supply !== "number" || typeof demand !== "number") return null;
        return Math.max(0, demand - supply);
      },
    });
  };

  // Rival index for capacity-decision telemetry, off the already-loaded
  // `globalSectors` snapshot: no turn-path reads. See capacityDecisionTelemetry.
  const competitorsByBucket = buildCapacityCompetitorIndex(globalSectors);
  // Sector concentration off the same snapshot, so reinvestment can lean growth
  // toward the firms behind a dominant leader. No extra read.
  const concentrationBySector = computeSectorConcentration(
    globalSectors.map((s) => ({
      sectorType: s.sectorType,
      corporationId: s.corporationId.toString(),
      weight: s.capitalStock ?? 0,
    }))
  );

  // One unowned-pool index for the whole cohort; each corporation's reinvest
  // decision reads it and the draws the loop applies stay visible through the
  // shared row objects, exactly as the per-corporation copies did.
  const reinvestPoolFor = createReinvestPoolLookup(unownedByCountry);

  const manufacturingProductProjectState = await loadNppProductProjectsV2(db, nppCorps);
  const plantsEnabled = manufacturingProductProjectState.plantsEnabled;
  let plants: NppPlantsContext | undefined;
  let conversionPaceShare = 0;
  let fundedRestartStage = 0;
  let productFillStage = 0;
  let shortageGrowthFinanceConfig: ShortageGrowthFinanceConfig | null = null;
  let bankRates: RelocationPrimeBank[] | undefined;
  if (plantsEnabled) {
    const gsPlants = await (
      await getGameStateCollection(db)
    ).findOne(
      { _id: "current" },
      { projection: { currentYear: 1, startingYear: 1, currentTurn: 1, preset: 1 } }
    );
    const plantsYear =
      gsPlants?.currentYear ??
      (gsPlants?.startingYear ?? STARTING_YEAR) +
        Math.floor(((gsPlants?.currentTurn ?? turn) - 1) / TURNS_PER_YEAR);

    const countryIds = [...new Set(nppCorps.map((c) => c.countryId))];
    // Bank rates are fixed during this phase; reuse this snapshot for quotes.
    const bankSnapshot = await loadNppBankRateSnapshot(db, countryIds);
    bankRates = bankSnapshot.bankRates;
    const primeByCountry = bankSnapshot.primeByCountry;
    const colByState = await loadNppCostOfLivingByState(db);
    const nationalShareOf = buildNppNationalShareResolver(globalSectors);
    const nppGameConfig = await gameConfigCollection<
      {
        commandEconomyEnabled?: boolean;
        producerConversionPaceShare?: number;
        producerFundedRestartStage?: number;
        wholePlantsStage?: number;
        producerCaptiveDeliveryStage?: number;
        nppStateServiceHeadroomStage?: number;
        nppDividendAfterTaxStage?: number;
        nppGrowthPerProductFillStage?: number;
      } & ShortageGrowthFinanceConfigInput
    >(db).findOne(
      { _id: "default" as never },
      {
        projection: {
          commandEconomyEnabled: 1,
          producerConversionPaceShare: 1,
          producerFundedRestartStage: 1,
          wholePlantsStage: 1,
          producerCaptiveDeliveryStage: 1,
          nppStateServiceHeadroomStage: 1,
          nppShortageGrowthFinanceStage: 1,
          nppDividendAfterTaxStage: 1,
          nppGrowthPerProductFillStage: 1,
          nppShortageGrowthFinanceCandidateLimit: 1,
          nppShortageGrowthFinanceMaxPaybackTurns: 1,
          nppShortageGrowthFinanceMaxExposureProfitTurns: 1,
        },
      }
    );
    conversionPaceShare = nppGameConfig?.producerConversionPaceShare ?? 0;
    fundedRestartStage = nppGameConfig?.producerFundedRestartStage ?? 0;
    shortageGrowthFinanceConfig = resolveShortageGrowthFinanceConfig(nppGameConfig);
    productFillStage = nppGameConfig?.nppGrowthPerProductFillStage ?? 0;
    plants = {
      enabled: true,
      year: plantsYear,
      eraUnitScale: await loadWorldEraUnitScale(db),
      preset: resolvePresetIdFromGameState(gsPlants),
      primeRateOf: (cid) => primeByCountry.get(cid) ?? 0,
      costOfLivingOf: (sid) => colByState.get(sid) ?? null,
      commodityDemandOf: (commodity) => priceByCommodity.get(commodity)?.globalDemand ?? null,
      commodityStateDemandOf: (commodity, stateId) =>
        priceByCommodity.get(commodity)?.stateDemand?.[stateId] ?? null,
      commodityCountryDemandOf: countryDemandResolver(
        priceByCommodity,
        await (
          await getStatesCollection(db)
        )
          .find({}, { projection: { _id: 1, countryId: 1 } })
          .toArray()
      ),
      commandEconomyEnabled: nppGameConfig?.commandEconomyEnabled === true,
      nationalShareOf,
      ...(wholePlantsOn(nppGameConfig?.wholePlantsStage) ? { wholePlants: true } : {}),
      ...((nppGameConfig?.producerCaptiveDeliveryStage ?? 0) >= 3
        ? { captiveMarketValue: true }
        : {}),
      ...((nppGameConfig?.nppDividendAfterTaxStage ?? 0) >= 2
        ? { holdExpansionAtCashFloor: true }
        : {}),
    };
    const groupResolver = await loadGroupDominanceSectorResolver(db, turn);
    if (groupResolver) plants.groupDominanceSectorsOf = groupResolver;
    // Local service pools that never refill: read their headroom from the
    // state book instead (rules/stateServiceHeadroom). Off = no read, no lift.
    if (stateServiceHeadroomOn(nppGameConfig?.nppStateServiceHeadroomStage)) {
      await liftStateServiceHeadroom(db, unownedByCountry, placementSignals, plants.eraUnitScale);
    }
  }
  const unownedDraws: NonNullable<NppCorpDecision["unownedDraws"]> = [];
  // Capacity-decision observations, aggregated in memory and flushed once for
  // the whole cohort below: no per-row turn queries, no new reads.
  const capacityObservations: CapacityDecisionObservation[] = [];
  const capexRows: BuildCapexTxInput[] = [];
  const entryDiagnostics: NppMarketEntryDiagnostic[] = [];

  // Resolve the world's current decade once for NPP tech-tree auto-picks.
  // World frontier research per lane, one aggregate for the cohort: opens the
  // 2049 breakthrough methods to NPP retooling and founding.
  let techCurrentYear = 0;
  let sectorResearchByLane: ReadonlyMap<string, number> | undefined;
  // Diffusion worlds: readiness by country, and the method operators taken
  // from the sector rows already in hand.
  let techDiffusion: TechDiffusionSnapshot | undefined;
  if (techTreesEnabled) {
    const [gs, researchByLane, diffusion] = await Promise.all([
      (await getGameStateCollection(db)).findOne(
        { _id: "current" },
        { projection: { currentYear: 1, startingYear: 1, currentTurn: 1 } }
      ),
      loadFrontierResearchByLane(db, techTreesEnabled),
      presetUsesTechDiffusion(strategyGate?.preset)
        ? loadTechDiffusionSnapshot(db, { sectors: globalSectors })
        : undefined,
    ]);
    sectorResearchByLane = researchByLane;
    techDiffusion = diffusion;
    const startingYear = gs?.startingYear ?? STARTING_YEAR;
    techCurrentYear =
      gs?.currentYear ??
      startingYear + Math.floor(((gs?.currentTurn ?? turn) - 1) / TURNS_PER_YEAR);
  }

  const manufacturingProductProjects = buildNppProductProjectsV2({
    state: manufacturingProductProjectState,
    nppCorporations: nppCorps,
    sectorsByCorp,
    turn,
    techCurrentYear,
    techTreesEnabled,
    plants,
    priceRatioOf,
  });

  // Local-per-₳ rates for every live currency, loaded once. NPP money constants
  // are all ₳; `liquidCapital` is not. See `NppCorpDecisionContext.fxRate`.
  const fxByCurrency = new Map<string, number>();
  for (const rate of await exchangeRatesCollection(db).find({}).toArray()) {
    if (rate.currencyCode && typeof rate.rate === "number" && rate.rate > 0) {
      fxByCurrency.set(rate.currencyCode, rate.rate);
    }
  }
  const { labourMode, retailExpansionPaused, ledgerShadow, bankingPolicy } =
    await loadNppBehaviorConfig(db, turn);
  const nppConstructionFinanceEnabled =
    plants?.enabled === true &&
    bankingPolicy.privateBanking &&
    bankingPolicy.treasuryCashLedger &&
    bankingPolicy.constructionFinance;
  const constructionFundingPool = nppConstructionFinanceEnabled
    ? await loadNppConstructionFundingPool({
        db,
        turn,
        corporations: nppCorps,
        policy: bankingPolicy,
        eraUnitScale: plants?.eraUnitScale ?? 1,
        fxByCurrency: fxByCurrency as ReadonlyMap<CurrencyCode, number>,
      })
    : null;
  const constructionFinanceCandidates: NppConstructionFinanceCandidate[] = [];

  // ─── Debt service, loaded once for the cohort ─────────────────────────────
  // Same two maps `buildCorporationLookups` builds for the turn engine, and the
  // same helpers it charges with, so the brain reads the number the engine
  // actually bills rather than an approximation of it. Issuer side is corporate
  // bonds only; holder side keeps sovereigns, because a corp parking cash in
  // treasuries genuinely collects that coupon.
  const { issuerBondsByCorpId, heldBondsByCorpId } = await loadNppCorporationBondLookups(
    db,
    preloaded
  );

  // Funded market: AI entrants build the recipe whose outputs are short. The
  // era gate needs the in-game year whether or not tech trees are on.
  const fundedRecipeWorld: FoundingRecipeWorld | undefined =
    transitionFirstFundedTurn != null
      ? {
          currentYear:
            strategyGate?.currentYear ??
            (strategyGate?.startingYear ?? STARTING_YEAR) +
              Math.floor(((strategyGate?.currentTurn ?? turn) - 1) / TURNS_PER_YEAR),
          techTreesEnabled,
          sectorResearchByLane,
          techDiffusion,
        }
      : undefined;
  // Founding never lands a plant its state cannot supply: the recipe it would
  // build is read against last turn's delivered input fill there. One value
  // per state and lane for the whole cohort; nothing in the pass moves it.
  const foundingInputByCell = new Map<string, number | null>();
  placementSignals.foundingInputAvailabilityOf = (candidate) => {
    const lane = getOperatingSectorType(
      candidate.sectorType,
      candidate.industryModel,
      candidate.mediaDiscriminator
    );
    const key = `${candidate.stateId}|${lane}`;
    const cached = foundingInputByCell.get(key);
    if (cached !== undefined) return cached;
    const value = foundingInputAvailability(
      lane,
      candidate.countryId,
      (commodity, countryId) =>
        statePriceRatioOf(commodity, candidate.stateId) ?? priceRatioOf(commodity, countryId),
      fundedRecipeWorld,
      { stateId: candidate.stateId, availabilityOf: stateInputAvailabilityOf }
    );
    foundingInputByCell.set(key, value);
    return value;
  };
  // Shortage per recipe (AI restarts) and per book (short-lane growth finance)
  // from the latest funded settlement, in one projected read.
  const shortageGrowthFinanceOn = shortageGrowthFinanceConfig != null && fundedWorldEpoch != null;
  const latestFundedOutcome =
    (fundedRestartStage >= 1 || shortageGrowthFinanceOn) &&
    transitionFirstFundedTurn != null &&
    strategyGate?.worldEpochId
      ? (
          await db
            .collection<{
              worldEpoch: string;
              turn: number;
              recipePressure?: Record<string, number>;
              bookPressure?: Record<string, number>;
            }>("producerMarketOutcomes")
            .find(
              { worldEpoch: strategyGate.worldEpochId, turn: { $lte: turn } },
              {
                projection: {
                  ...(fundedRestartStage >= 1 ? { recipePressure: 1 } : {}),
                  ...(shortageGrowthFinanceOn ? { bookPressure: 1 } : {}),
                },
              }
            )
            .sort({ turn: -1 })
            .limit(1)
            .toArray()
        )[0]
      : undefined;
  const recipePressureByKey =
    fundedRestartStage >= 1 && latestFundedOutcome
      ? new Map(Object.entries(latestFundedOutcome.recipePressure ?? {}))
      : null;
  const bookPressureByBook =
    shortageGrowthFinanceOn && latestFundedOutcome
      ? new Map(Object.entries(latestFundedOutcome.bookPressure ?? {}))
      : null;
  const shortageGrowthFinance: NppCorpDecisionContext["shortageGrowthFinance"] =
    shortageGrowthFinanceConfig && bookPressureByBook && bookPressureByBook.size > 0
      ? {
          config: shortageGrowthFinanceConfig,
          pressureOf: (sector) =>
            sectorBookPressure(
              sector.producerSettlement as Parameters<typeof sectorBookPressure>[0],
              fundedWorldEpoch,
              bookPressureByBook,
              productFillStage >= 1
            ),
        }
      : undefined;
  const groupMembership = await loadGroupDirectionMembership(
    db,
    nppCorps,
    preloaded?.groupMembership
  );
  const strategyLoopEnabled = strategyGate?.nppCorpStrategyEnabled !== false;
  // Frontier-entry experiment turn state (issue #991). See
  // createFrontierEntryTurnState: fail-closed, no new turn-path round trip.
  const frontierEntryTurn = createFrontierEntryTurnState(
    strategyGate?.frontierEntryExperimentEnabled
  );

  const labourWagesEnabled = isLabourSystemMode(labourMode) && labourAtLeast(labourMode, "wages");

  // Pace AI free conversions: a per-country allowance of capacity book value per turn.
  const capacityBookByCountry = new Map<string, number>();
  if (conversionPaceShare > 0)
    for (const corpSectors of sectorsByCorp.values())
      for (const s of corpSectors)
        if (s.mothballed !== true && s.countryId)
          capacityBookByCountry.set(
            String(s.countryId),
            (capacityBookByCountry.get(String(s.countryId)) ?? 0) + (s.capacityBookAnchor ?? 0)
          );
  const conversionBudgets = buildConversionBudgets(capacityBookByCountry, conversionPaceShare);

  const autopilotAlerts: Array<{ corp: Corporation; kinds: CorpAutopilotAdvisory[] }> = [];

  // NPP engine 6 corporate decisions, resolved once per country. The snapshot
  // reads the world's autonomy level once instead of once per country, and the
  // per-country enablement reads run together rather than in sequence.
  const engineSixByCountry = await withNppAutonomySnapshot(db, async () => {
    const engineSix = new Map<string, boolean>();
    const countryIds = [...new Set(nppCorps.map((corp) => corp.countryId))];
    const levels = await Promise.all(
      countryIds.map((countryId) => nppAutonomyAtLeast(db, countryId, NPP_ENGINE_LEVEL))
    );
    countryIds.forEach((countryId, index) => engineSix.set(countryId, levels[index] === true));
    return engineSix;
  });

  // v2: one cohort bundle for the relocation-bond credit fan. Absent on v1,
  // where `resolveNppMarketEntryCredit` reads per corporation.
  const relocationCreditBatch = preloaded?.batchRelocationCredit
    ? createRelocationCreditBatch({
        db,
        corporations: nppCorps,
        sectorsByCorp,
        heldBondsByCorpId,
        fxByCurrency: fxByCurrency as ReadonlyMap<CurrencyCode, number>,
        bankRates,
        writeReason: setNppMarketEntryReason,
      })
    : null;

  const orderedCorps =
    conversionPaceShare > 0
      ? [...nppCorps].sort((a, b) => (a._id.toString() < b._id.toString() ? -1 : 1))
      : nppCorps;
  for (const corp of orderedCorps) {
    const sectors = sectorsByCorp.get(corp._id.toString()) ?? [];
    const autopilot = isAutopilotRun(corp);
    const operator = operatorPermissionsFor(corp);
    const borrowAllowed = operatorMay(operator, "borrow");
    const archetype =
      (corp.ceoId && archetypeByNppId.get(corp.ceoId.toString())) || DEFAULT_ARCHETYPE;
    const corpCurrency = resolveCorpLiquidCurrencyCode(corp);
    const corpFxRate = (corpCurrency && fxByCurrency.get(corpCurrency)) || 1;
    const entryCohortEligible = glutStaggerEligible(corp._id.toString(), turn);
    const criticalLogisticsEligible = criticalLogisticsStaggerEligible(corp._id.toString(), turn);
    const decisionContext: NppCorpDecisionContext = {
      corp,
      groupDirection: groupMembership?.eligibleManagementRoots?.has(
        groupMembership.rootByCorpId.get(corp._id.toString()) ?? ""
      )
        ? corp.groupDirection
        : undefined,
      groupRootId: groupMembership?.rootByCorpId.get(corp._id.toString()),
      sectors,
      turn,
      now,
      fxRate: corpFxRate,
      competitorCountOf: makeCapacityCompetitorCounter(competitorsByBucket),
      challengerBoostOf: (sectorType, ownCorporationId) =>
        challengerBoost(concentrationBySector.get(sectorType), ownCorporationId),
      fxByCurrency,
      strategy: corp.nppStrategy,
      strategyEligible: entryCohortEligible,
      ordinaryEntryEligible: entryCohortEligible,
      criticalLogisticsEntryEligible: criticalLogisticsEligible,
      criticalLogisticsShortageEligible: criticalLogisticsEligible && borrowAllowed,
      operator,
      // An operator barred from borrowing (autopilot by default) never takes shortage-entry credit.
      shortageEntryEligible: entryCohortEligible && borrowAllowed,
      retailExpansionPaused,
      caretakerMandate: corp.caretakerCeo?.mandate ?? "active",
      strategyLoopEnabled,
      debtServiceAnchor: netPerTurnDebtServiceAnchor({
        issuerBonds: issuerBondsByCorpId.get(corp._id.toString()),
        heldPositions: heldBondsByCorpId.get(corp._id.toString()),
        fxByCurrency: fxByCurrency as ReadonlyMap<CurrencyCode, number>,
        // The government bond subsidy waives issuer interest for national
        // enterprises, exactly as `perTurnBondDragOnNetIncome` does.
        isNationalEnterprise: !!corp.countryOwnerId,
      }),
      modifiers: autopilot ? AUTOPILOT_MODIFIERS : ceoArchetypeModifiers(archetype),
      labourWagesEnabled,
      currentYear: techCurrentYear > 0 ? techCurrentYear : undefined,
      techTreesEnabled,
      sectorResearchByLane,
      techDiffusion,
      frontierEntry: autopilot ? undefined : frontierEntryTurn,
      engineSix: engineSixByCountry.get(corp.countryId) === true,
      transitionFirstFundedTurn,
      fundedRecipeWorld,
      fundedWorldEpoch,
      conversionBudgetOf:
        conversionPaceShare > 0 ? (countryId) => conversionBudgets.get(countryId) : undefined,
      reinvestPoolFor,
      fundedRestartPressureOf: recipePressureByKey
        ? (sectorType, strategyId) => recipePressureByKey.get(recipeKey(sectorType, strategyId))
        : undefined,
      ...(shortageGrowthFinance && !autopilot ? { shortageGrowthFinance } : {}),
      ...(productFillStage >= 1 ? { productFillStage } : {}),
    };
    let decision = makeNppCorpDecision(
      decisionContext,
      unownedByCountry,
      stateControlled,
      priceRatioOf,
      plants,
      placementSignals
    );

    decision = relocationCreditBatch
      ? await relocationCreditBatch.resolve({
          corporation: corp,
          decision,
          turn,
          fxByCurrency: fxByCurrency as ReadonlyMap<CurrencyCode, number>,
          corpFxRate,
          retry: (creditLocal) =>
            makeNppCorpDecision(
              { ...decisionContext, shortageEntryCreditLocal: creditLocal },
              unownedByCountry,
              stateControlled,
              priceRatioOf,
              plants,
              placementSignals
            ),
        })
      : await resolveNppMarketEntryCredit({
          db,
          corporation: corp,
          decision,
          turn,
          fxByCurrency: fxByCurrency as ReadonlyMap<CurrencyCode, number>,
          bankRates,
          corpFxRate,
          retry: (creditLocal) =>
            makeNppCorpDecision(
              { ...decisionContext, shortageEntryCreditLocal: creditLocal },
              unownedByCountry,
              stateControlled,
              priceRatioOf,
              plants,
              placementSignals
            ),
        });
    // Charge the pacing allowance once, for the decision that is applied.
    if (decision.conversionCharge)
      chargeConversionBudget(
        conversionBudgets.get(decision.conversionCharge.countryId),
        decision.conversionCharge.cost
      );
    if (nppConstructionFinanceEnabled && corpCurrency && borrowAllowed) {
      // A short-lane growth request may put in cash below the floor, read from
      // the cash left after this decision's own builds (rules/shortageGrowthFinance).
      const cashAfterDecisionLocal = (corp.liquidCapital ?? 0) + decision.liquidCapitalDelta;
      for (const intent of decision.constructionFinanceIntents ?? []) {
        constructionFinanceCandidates.push({
          ...intent,
          ...(intent.shortageGrowth
            ? {
                cashContributionLimitLocal: shortageGrowthCashContributionLimit(
                  cashAfterDecisionLocal,
                  decision.cashFloorLocal ?? 0,
                  plants?.holdExpansionAtCashFloor === true
                ),
              }
            : {}),
          corporation: corp,
          currency: corpCurrency,
          buildContext: {
            destinationCurrency: currencyForCountry(intent.sector.countryId ?? corp.countryId),
            bucket: {
              stateId: intent.sector.stateId,
              countryId: intent.sector.countryId ?? corp.countryId,
              sectorType: intent.sector.sectorType,
              industryModel: intent.sector.industryModel ?? null,
              mediaDiscriminator: intent.sector.mediaDiscriminator ?? null,
            },
            eraUnitScale: plants?.eraUnitScale ?? 1,
            growthUnits: intent.growthUnits,
          },
        });
      }
    }
    markMarketsActive(placementSignals, decision.newSectors);
    if (decision.entryDiagnostic) entryDiagnostics.push(decision.entryDiagnostic);
    // Cohort telemetry aggregate (credit-rewrite included); see capacityDecisionTelemetry.
    mergeCapacityObservations(
      capacityObservations,
      decision.capacityObservations,
      decision.entryDiagnostic?.reason
    );
    if (decision.operatorObservation) operatorObservations.push(decision.operatorObservation);
    const {
      founded,
      update: corpUpdateOp,
      witness,
    } = buildNppDecisionCashWrites({
      decision,
      corporation: corp,
      capexRows,
      unownedDraws,
      unownedIndex,
      eraUnitScale: plants?.eraUnitScale ?? 1,
      currencyCode: corpCurrency,
      rate: corpFxRate,
      shadowEnabled: ledgerShadow,
      blocked,
      turn,
      now,
    });
    if (corpUpdateOp) {
      corpUpdates.push(corpUpdateOp);
      decisionCashOps.push(corpUpdateOp);
    }
    if (witness) foundingCashWitnesses.push(witness);

    // Budget tech from post-decision cash and preserve the same safety floor.
    // Autopilot computes the same pick into scratch arrays and leaves it to the
    // owner: a tech lane commitment is permanent, so it is the owner's call.
    const techScratch: TechUnlockLedgerInput[] = [];
    const researchPermission = operator.actions.research;
    if (
      techTreesEnabled &&
      decisionContext.caretakerMandate !== "passive" &&
      researchPermission !== "never"
    ) {
      maybePushNppTechUnlock({
        corp,
        dailyGrossRevenueLocal: corpDailyGrossRevenueLocalFromSectors(sectors, corp, {
          plantsEnabled,
          eraUnitScale: plants?.eraUnitScale ?? 1,
          fxByCurrency: fxByCurrency as ReadonlyMap<CurrencyCode, number>,
        }),
        techCashFloorLocal: corpTechCashFloorLocal(corp, {
          eraUnitScale: plants?.eraUnitScale ?? 1,
          fxByCurrency: fxByCurrency as ReadonlyMap<CurrencyCode, number>,
        }),
        techPlantBasis: corpTechPlantBasisFromSectors(sectors, corp, {
          fxByCurrency: fxByCurrency as ReadonlyMap<CurrencyCode, number>,
        }),
        techCurrentYear,
        turn,
        now,
        corpUpdates: researchPermission === "allow" ? corpUpdates : [],
        liquidCapitalDelta: decision.liquidCapitalDelta,
        cashReserve: decision.cashFloorLocal,
        techLedger: researchPermission === "allow" ? techLedger : techScratch,
      });
    }

    if (autopilot && corp.autopilot) {
      const advisories = deriveAutopilotAdvisories(
        {
          chronicLowFill: decision.autopilotSignals?.chronicLowFill === true,
          debtDominant: decision.autopilotSignals?.debtDominant === true,
          losingSectors: decision.autopilotSignals?.losingSectors ?? 0,
          distressed: corp.financialDistressSinceTurn != null,
          affordableTech: techScratch[0]?.nodeName ?? null,
        },
        corp.autopilot.advisories,
        turn
      );
      if (advisoriesChanged(corp.autopilot.advisories, advisories)) {
        const notify = advisoriesToNotify(
          corp.autopilot.advisories,
          advisories,
          corp.autopilot.notifiedTurn,
          turn
        );
        const $set: Record<string, unknown> = {
          "autopilot.advisories": advisories,
          updatedAt: now,
        };
        for (const a of notify) $set[`autopilot.notifiedTurn.${a.kind}`] = turn;
        corpUpdates.push({ filter: { _id: corp._id }, update: { $set } });
        if (notify.length > 0) autopilotAlerts.push({ corp, kinds: notify });
      }
    }

    // Accrual (the score memory) happens every turn inside the decision, but the
    // stored document only needs rewriting when its meaningful content changed.
    if (decision.strategy && strategyStateNeedsPersist(corp.nppStrategy, decision.strategy)) {
      corpUpdates.push({
        filter: { _id: corp._id },
        update: { $set: { nppStrategy: decision.strategy, updatedAt: now } },
      });
    }

    allSectorUpdates.push(...decision.sectorUpdates);

    newSectors.push(...founded);

    if (decision.divestedSectorIds) {
      allDivestedSectorIds.push(...decision.divestedSectorIds);
    }
  }

  // v2: every planned relocation bond lands in loop order, exactly where v1's
  // per-corp `insertOne` would have put it, before the caller reads bonds again.
  await relocationCreditBatch?.flush();

  // Short-lane growth requests rank under their own cap with exposure and cash
  // limits (rules/shortageGrowthFinance); every other request keeps the
  // ordinary cap. With the stage off no candidate carries shortageGrowth.
  const shortageCandidates = constructionFinanceCandidates.filter((c) => c.shortageGrowth);
  const ordinaryCandidates =
    shortageCandidates.length > 0
      ? constructionFinanceCandidates.filter((c) => !c.shortageGrowth)
      : constructionFinanceCandidates;
  const boundedConstructionFinance = nppConstructionFinanceEnabled
    ? boundNppConstructionFinanceCandidates(ordinaryCandidates)
    : { selected: [] as NppConstructionFinanceCandidate[], backlogCount: 0 };
  if (nppConstructionFinanceEnabled && shortageCandidates.length > 0) {
    const bounded = boundNppShortageGrowthFinanceCandidates(
      shortageCandidates,
      shortageGrowthFinanceConfig,
      constructionFundingPool
    );
    boundedConstructionFinance.selected.push(...bounded.selected);
    boundedConstructionFinance.backlogCount += bounded.backlogCount;
  }
  const constructionFinanceRequests: NppConstructionFinanceRequest[] = [];
  let constructionFinanceBacklogCount =
    boundedConstructionFinance.backlogCount +
    (nppConstructionFinanceEnabled && !constructionFundingPool
      ? boundedConstructionFinance.selected.length
      : 0);
  if (constructionFundingPool) {
    for (const candidate of boundedConstructionFinance.selected) {
      const selected = selectNppConstructionFundingContext(constructionFundingPool, candidate);
      if (!selected) {
        constructionFinanceBacklogCount += 1;
        continue;
      }
      constructionFinanceRequests.push({
        ...candidate,
        bankId: selected.bankId,
        principal: selected.principal,
        termTurns: NPP_CONSTRUCTION_FINANCE_TERM_TURNS,
        preloadedFundingContext: selected.context,
      });
    }
  }

  await drawFoundedCapacityFromPools(db, unownedDraws, {
    eraUnitScale: plants?.eraUnitScale ?? 1,
    now,
  });
  const reinvestmentCashWitnesses = await flushNppCapacityWriteback(db, {
    turn,
    now,
    entryDiagnostics,
    capexRows,
    cashOperations: decisionCashOps,
    shadowEnabled: ledgerShadow,
    capacityObservations,
    operatorObservations,
  });

  await createNotifications(
    autopilotAlerts.flatMap(({ corp, kinds }) =>
      corp.userId
        ? kinds.map((kind) => {
            const copy = AUTOPILOT_ADVISORY_COPY[kind.kind];
            return {
              userId: corp.userId!,
              type: "corp_autopilot_advisory" as const,
              title: `${corp.name}: ${copy.title}`,
              message: copy.body(kind.subject),
              metadata: { corporationId: corp._id.toString(), advisory: kind.kind },
            };
          })
        : []
    )
  );

  return {
    corpUpdates,
    sectorUpdates: allSectorUpdates,
    newSectors,
    divestedSectorIds: allDivestedSectorIds,
    techLedger,
    manufacturingProductProjects,
    constructionFinanceRequests,
    constructionFinanceCandidateCount: constructionFinanceCandidates.length,
    constructionFinanceBacklogCount,
    ...(foundingCashWitnesses.length ? { foundingCashWitnesses } : {}),
    ...(reinvestmentCashWitnesses.length ? { reinvestmentCashWitnesses } : {}),
  };
}

/** Country demand per commodity: the sum of its states' demand, memoised per lookup. */
function countryDemandResolver(
  priceByCommodity: ReadonlyMap<string, { stateDemand?: Record<string, number> | null }>,
  states: readonly Pick<State, "_id" | "countryId">[]
): (commodity: string, countryId: string) => number | null {
  const statesByCountry = new Map<string, string[]>();
  for (const s of states) {
    const list = statesByCountry.get(String(s.countryId)) ?? [];
    list.push(String(s._id));
    statesByCountry.set(String(s.countryId), list);
  }
  const memo = new Map<string, number | null>();
  return (commodity, countryId) => {
    const key = `${commodity}|${countryId}`;
    if (memo.has(key)) return memo.get(key)!;
    const byState = priceByCommodity.get(commodity)?.stateDemand;
    const ids = statesByCountry.get(countryId) ?? [];
    const value =
      byState && ids.length ? ids.reduce((n, id) => n + (Number(byState[id]) || 0), 0) : null;
    memo.set(key, value);
    return value;
  };
}
