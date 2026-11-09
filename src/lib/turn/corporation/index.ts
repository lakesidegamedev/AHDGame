import { configureGroupSupply } from "./groupSupplyTurn";
import { migrateEntertainmentRemoval } from "./migrateEntertainmentRemoval";
import { claimProducerPath, loadProducerPath } from "@/lib/market/producerMarket/liveMode";
import { producerStageEnv, runFundedProducerTurn } from "./fundedProducerTurn";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";
import type { ProducerPhysicalEnv } from "./producerPhysicalPreparation";
import { makeLabourDemandByState } from "@/lib/labour/labourMarket";
import { resolvePhaseLookups } from "./phaseLookups";
/**
 * Corporation turns settle operating results and distribute shareholder income.
 * processCorporationTurn shares monetary quotes across automatic dividend conversions.
 */
import { CORPORATION_TURN_GAME_CONFIG_PROJECTION } from "./gameConfigProjection";
import type { StatePolicy } from "@/lib/db/types/statePolicy";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { getDb } from "@/lib/mongodb";
import { buildCorporationLookups } from "./buildLookups";
import { buildFreightBillingBySector } from "./freightBillingTurn";
import { shedVacantCeoSectorsToUnowned } from "./vacantCeoSectorShed";
import { shedInactiveCeoSectorsToUnowned } from "./inactiveCeoSectorShed";
import { installCaretakersForVacantCorps } from "./autoCaretakerVacantCorps";
import { loadEngineSixCountries } from "./engineSixCountries";
import { runNppCeoCareerPasses } from "./nppCeoPay";
import { processSectors } from "./sectorCalculations";
import { getLabourSystemMode, labourAtLeast } from "@/lib/labour/featureFlag";
import { getMarketSystemMode, marketAtLeast } from "@/lib/market/featureFlag";
import { buildMarketContext } from "@/lib/market/marketContext";
import { normalizeCommodityFixStage } from "@/lib/market/commodityFixStages";
import { normalizeMarketRecoveryStage } from "@/lib/market/marketRecoveryStages";
import { isFairnessDoctrineInEffect } from "@/lib/mediaRegulation/rules";
import { runClearingPrePass } from "./clearingPrePass";
import { computeQualityUpdates } from "./brandQualityTurn";
import { consumeManufacturingDevelopmentReceiptsV2 } from "@/lib/products/manufacturingProjectPersistence";
import { loadAdvertisingEfficacyByCorp } from "@/lib/advertising/persistence";
import type { CorporationTurnOptions } from "./corporationTurnOptions";
import { transitionAnchorTurn } from "@/lib/market/producerMarket/transitionRules";
import { getEffectiveStrategyRatesForOperatingModel } from "@/lib/constants/sectorStrategies";
import { type SettleableSupplyAgreement } from "./settleSupplyAgreements";
import type { CommodityType } from "@/lib/constants/commodities";
import { loadSettleableSupplyAgreements } from "./loadSettleableSupplyAgreements";
import { resolveMinWageRatioByCountry } from "@/lib/labour/minimumWageLaws";
import {
  buildUnionLawBiasByCountry,
  buildUnionsBannedByCountry,
  type LabourContext,
} from "@/lib/labour/laborCost";
import { withAutomationUnionBias } from "@/lib/automationPolicy/policies";
import { buildUnionEffectsById } from "@/lib/unions/unionLookups";
import { loadUndergroundStrengthByCountrySector } from "@/lib/unions/undergroundEffects";
import { loadCollectiveAgreementEffects } from "@/lib/unions/collectiveAgreementEffects";
import { loadIndustrialActionOutputFactors } from "@/lib/unions/industrialActionEffects";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { loadTxThresholds } from "@/lib/financialTxLog/emit";
import { getGameState } from "@/lib/gameState";
import type { ActionAuditInput } from "@/lib/db/types/actionAuditLog";
import { createCorporationTurnTimer, type CorporationTurnResult } from "./corporationTurnRuntime";
import { processEquityMarketPoolTurn } from "@/lib/equities/marketPoolTurn";
import { placePendingShareIssuances } from "@/lib/equities/primaryMarket";
import {
  loadPoliticalMediaOrdersForClearing,
  savePoliticalMediaSettlementPlans,
  type PoliticalMediaOrderForClearing,
} from "@/lib/politicalMedia/journal";
import { applyMediaEditorialEffects } from "@/lib/mediaEditorial/applyEffects";
import { loadVentureBoostBySectorId } from "@/lib/products/venture/turn";
import { ventureDomainsEnabled } from "@/lib/products/venture/access";
import { resumeFoundingUnderwritingPlans } from "@/lib/banking/underwritingSettlement";
import {
  processMediaProductProjectsV1,
  startNppMediaProductsV1,
} from "@/lib/products/mediaProductPersistence";
import { getMediaProductKind } from "@/lib/products/mediaProductCatalog";
import { aggregateMediaProductSectorEffects } from "@/lib/products/rules/mediaProductRules";
import { runCorporationTurnSideEffects } from "./corporationTurnSideEffects";
import { settleCorporationTurnPayouts } from "./corporationTurnPayouts";

export type { CorporationTurnResult } from "./corporationTurnRuntime";

export { CORP_TURN_RNG_SALT } from "./corporationTurnPayouts";

/**
 * Run the corporation economy, settlement, ownership, and reporting phases for one turn.
 */

export async function processCorporationTurn(
  turn?: number,
  options: CorporationTurnOptions = {}
): Promise<CorporationTurnResult> {
  const db = await getDb();
  const now = new Date();
  const phaseStartedAt = Date.now();

  const timer = createCorporationTurnTimer();
  const mark = timer.mark;

  // Preamble reads are independent, so they run as one parallel round-trip
  // instead of ~7 serial ones. marketGovernorConfig must be read here, before
  // the lookup build: the market-share basis below needs the mode and the mode
  // lives in this same document, so we resolve it exactly once per turn.
  const [forexEnabled, thresholds, marketGovernorConfig, gameState, labourMode] = await Promise.all(
    [
      isForexEnabled(),
      loadTxThresholds(db),
      db.collection<GameConfig>("gameConfig").findOne(
        { _id: "default" },
        {
          projection: CORPORATION_TURN_GAME_CONFIG_PROJECTION,
        }
      ),
      getGameState(),
      getLabourSystemMode(),
    ]
  );
  mark("preamble");
  if (marketGovernorConfig?.privateBankingEnabled === true) {
    await resumeFoundingUnderwritingPlans(db, now);
  }
  const equityPoolTurn = await processEquityMarketPoolTurn(
    db,
    turn ?? gameState?.currentTurn ?? 0,
    now
  );
  await placePendingShareIssuances(db, turn ?? gameState?.currentTurn ?? 0, now);
  mark("equityMarketPool");
  // SINGLE SOURCE OF TRUTH for this turn's market mode, both the market-share
  // basis just below and `buildMarketContext` further down consume it. Do not
  // re-resolve it; a second `getMarketSystemMode()` call is how the two drifted.
  const marketSystemMode = await getMarketSystemMode(marketGovernorConfig);

  // Phase 1: Build all lookup maps from DB (one parallel fetch)
  // Market share (which drives the dominance growth-cost multiplier) switches
  // to the owned-capacity basis under the plants tier.
  const plantsEnabledForMarketShare = marketAtLeast(marketSystemMode, "plants");
  // One-time: entertainment commodity removal rescales stock before lookups load it.
  await migrateEntertainmentRemoval(db, {
    turn: turn ?? gameState?.currentTurn ?? 0,
    plantsEnabled: plantsEnabledForMarketShare,
    now,
  });
  const interstateMoneyWiringEnabled =
    (marketGovernorConfig as { interstateMoneyWiringEnabled?: boolean } | null)
      ?.interstateMoneyWiringEnabled === true;
  const freightSettlementActive =
    (marketGovernorConfig as { freightSettlementMode?: string } | null)?.freightSettlementMode ===
      "active" && marketAtLeast(marketSystemMode, "clearing");
  // Canonical freight billing (default OFF): when on, last turn's per-state
  // shipping money is loaded from sourcingNetworkLoad and apportioned across
  // sectors below. Off leaves lookup maps empty and billing inert.
  const canonicalFreightBillingEnabled =
    (marketGovernorConfig as { canonicalFreightBillingEnabled?: boolean } | null)
      ?.canonicalFreightBillingEnabled === true;
  const mediaEditorialEnabled = marketGovernorConfig?.mediaEditorialEnabled === true;
  const mediaOperatingModelsEnabled = marketGovernorConfig?.mediaOperatingModelsEnabled === true;
  const mediaProductSlatesEnabled =
    marketAtLeast(marketSystemMode, "clearing") &&
    mediaOperatingModelsEnabled &&
    marketGovernorConfig?.mediaProductSlatesEnabled === true &&
    marketGovernorConfig?.brandLoyaltyEnabled === true &&
    marketGovernorConfig?.brandLoyaltySliceEnabled === true &&
    marketGovernorConfig?.qualityPremiumPricingEnabled === true;
  const mediaRegulationEnabled =
    marketAtLeast(marketSystemMode, "clearing") &&
    marketGovernorConfig?.mediaRegulationEnabled === true;
  const [lookups, mediaRegulationPolicy] = await Promise.all([
    buildCorporationLookups(db, {
      plantsEnabled: plantsEnabledForMarketShare,
      explicitPlantCostsEnabled:
        plantsEnabledForMarketShare && marketGovernorConfig?.explicitPlantCostsEnabled === true,
      productionTurn: turn,
      freightSettlementActive,
      moneyWiringEnabled: interstateMoneyWiringEnabled,
      canonicalFreightBillingEnabled,
      mediaEditorialEnabled:
        mediaEditorialEnabled ||
        (mediaRegulationEnabled &&
          typeof gameState?.currentYear === "number" &&
          gameState.currentYear <= 1986),
      mediaProductSlatesEnabled,
      politicalMediaMarketEnabled: marketGovernorConfig?.politicalMediaMarketEnabled === true,
      productLinesV2Enabled:
        plantsEnabledForMarketShare &&
        (marketGovernorConfig as { productLinesV2Enabled?: boolean } | null)
          ?.productLinesV2Enabled === true,
    }),
    mediaRegulationEnabled
      ? db
          .collection<StatePolicy>("statePolicies")
          .findOne(
            { legislationTypeId: "us_media_communications", stateId: "federal" },
            { projection: { policyOptionIndex: 1 } }
          )
      : Promise.resolve(null),
  ]);
  await resolvePhaseLookups(db, marketGovernorConfig, turn ?? gameState?.currentTurn ?? 0, lookups);
  // Where an unstamped sector's build deliveries catch up from (#5169).
  lookups.worldBuildsSettledTurn = gameState?.buildDeliverySettledTurn;
  if (
    mediaProductSlatesEnabled &&
    lookups.mediaProductProjectsByCorpId &&
    typeof gameState?.currentYear === "number"
  ) {
    const startedNppProjects = await startNppMediaProductsV1({
      db,
      corporations: lookups.corporations,
      sectorsByCorp: lookups.sectorsByCorp,
      projectsByCorporationId: lookups.mediaProductProjectsByCorpId,
      currentYear: gameState.currentYear,
      currentTurn: turn ?? 1,
    });
    for (const project of startedNppProjects) {
      const development = lookups.mediaProductDevelopmentByCorpId ?? new Map();
      development.set(project.corporationId, project);
      lookups.mediaProductDevelopmentByCorpId = development;
      const bySector = lookups.mediaProductProjectsBySectorId ?? new Map();
      const sectorProjects = bySector.get(project.sectorId) ?? [];
      sectorProjects.push(project);
      bySector.set(project.sectorId, sectorProjects);
      lookups.mediaProductProjectsBySectorId = bySector;
    }
  }
  // Product ventures reuse the existing product flags: media titles follow the
  // slates flag, manufactured lines follow product lines v2. Read through the same helper the venture routes use. The governor
  // projection above does not carry mediaProductSlatesEnabled, so reading it
  // from there left every media venture unprocessed while players could start
  // them.
  const productVentureDomainsEnabled = await ventureDomainsEnabled(db);
  if (productVentureDomainsEnabled.media || productVentureDomainsEnabled.manufacturing) {
    lookups.productVentureBoostBySectorId = await loadVentureBoostBySectorId(db, {
      turn: turn ?? 1,
      sectorsByCorp: lookups.sectorsByCorp,
      enabled: productVentureDomainsEnabled,
    });
  }
  const politicalMediaMarketEnabled = marketGovernorConfig?.politicalMediaMarketEnabled === true;
  const politicalMediaOrders: PoliticalMediaOrderForClearing[] = politicalMediaMarketEnabled
    ? await loadPoliticalMediaOrdersForClearing(db, turn ?? 0)
    : [];
  // Coverage efficacy earned by last turn's advertising agreements. Empty when
  // the gate is off, which leaves product brand formation neutral.
  const advertisingEfficacyByCorpId = mediaOperatingModelsEnabled
    ? await loadAdvertisingEfficacyByCorp(db, (turn ?? gameState?.currentTurn ?? 0) - 1)
    : new Map<string, { turn: number; factor: number }>();
  if (lookups.productLinesV2Enabled && lookups.manufacturingProductByCorpId) {
    await consumeManufacturingDevelopmentReceiptsV2({
      db,
      corporations: lookups.corporations,
      projectsByCorporationId: lookups.manufacturingProductByCorpId,
      completedTurn: (turn ?? gameState?.currentTurn ?? 0) - 1,
      advertisingEfficacyByCorporationId: advertisingEfficacyByCorpId,
    });
  }
  const currentYear = gameState?.currentYear;
  // Soft-budget gate for the turn path (see sectorTurn's affordability brake and
  // nppInsolvencyDissolution, which already exempts planned economies). Read off
  // the preamble's gameConfig projection, same document, no second round-trip.
  const commandEconomyEnabled =
    (marketGovernorConfig as { commandEconomyEnabled?: boolean } | null)?.commandEconomyEnabled ===
    true;
  const privateBankingEnabled =
    (marketGovernorConfig as { privateBankingEnabled?: boolean } | null)?.privateBankingEnabled ===
    true;
  const treasuryCashLedgerEnabled = marketGovernorConfig?.treasuryCashLedgerEnabled === true;
  mark("buildLookups+gameState");

  // Labour/Unions system: when labourSystemMode ≥ "wages", sector profit carves
  // an explicit, per-sector/per-era labor cost out of maintenance (resolved per
  // sector inside processSectors from sectorType + currentYear). Inert (no
  // economic change) when the mode is off, the default.
  const fullEnabled = labourAtLeast(labourMode, "full");
  const bannedUnionCountryIds = buildUnionsBannedByCountry(lookups.federalBudgets);
  const [
    unionsById,
    collectiveAgreementEffects,
    industrialActionOutputFactorBySectorId,
    undergroundStrengthByCountrySector,
  ] = fullEnabled
    ? await Promise.all([
        buildUnionEffectsById(db, turn ?? gameState?.currentTurn ?? 0),
        loadCollectiveAgreementEffects(db, turn ?? gameState?.currentTurn ?? 0),
        loadIndustrialActionOutputFactors(db),
        loadUndergroundStrengthByCountrySector(db, bannedUnionCountryIds),
      ])
    : [undefined, undefined, undefined, undefined];
  const wagesEnabled = labourAtLeast(labourMode, "wages");
  const labour: LabourContext = {
    wagesEnabled,
    // minimumWageLawStage: the national minimum wage law in force sets the
    // floor. Below the wages tier the floor is unused, so the law is not read.
    minWageRatioByCountry: await resolveMinWageRatioByCountry(
      db,
      lookups.federalBudgets,
      wagesEnabled ? marketGovernorConfig?.minimumWageLawStage : undefined
    ),
    // v3 Phase 5/6: gates the NPC unionization metric + strikes.
    unionsEnabled: labourAtLeast(labourMode, "unions"),
    // v3 Phase 7b: gates union-law bias + union-busting.
    fullEnabled,
    unionLawBiasByCountry: withAutomationUnionBias(
      buildUnionLawBiasByCountry(lookups.federalBudgets),
      lookups.automationPolicyByCountry
    ),
    // Union ban (player suggestion #93): read at the "unions" tier (the same
    // tier the unionization/strike machinery runs at), unlike the bias map
    // above whose reads are gated at "full".
    unionsBannedByCountry: bannedUnionCountryIds,
    undergroundStrengthByCountrySector,
    // Union dues v1: gated read, only fetched when fullEnabled, so a union
    // document's mere existence never has an effect at a lower tier. Resolved
    // per-sector via `CorporateSector.representingUnionId`, not by
    // (countryId, sectorType), see `sectorLabour.ts`.
    unionsById,
    collectiveAgreementWageFloorBySectorId: collectiveAgreementEffects?.wageFloorBySectorId,
    noStrikeProtectedSectorIds: collectiveAgreementEffects?.noStrikeProtectedSectorIds,
    industrialActionOutputFactorBySectorId,
  };
  mark("labourContext");

  const brandLoyaltyEnabled = marketGovernorConfig?.brandLoyaltyEnabled === true;
  const sectorQualityEnabled = marketGovernorConfig?.sectorQualityEnabled === true;
  // Quality → premium coupling only bites when quality is actually computed AND
  // the Package-B gate is on (default off ⇒ clearing revenue unchanged).
  const qualityPremiumPricingEnabled =
    sectorQualityEnabled && marketGovernorConfig?.qualityPremiumPricingEnabled === true;
  const supplyAgreementsEnabled = marketGovernorConfig?.supplyAgreementsEnabled === true;

  // Private supply agreements: contracted output per supplier corp per commodity.
  // A supply agreement reserves the contracted volume for the buyer (additive);
  // the supplier's surplus above it still clears on the open market.
  // Every per-corp contract map below is keyed by `supplyAgreementScopeKey`:
  // the bare commodity for a corporation-wide agreement, `commodity@stateId`
  // for a state-scoped one (freight), so a state contract is reserved,
  // produced and settled against that one state's plants.
  let contractedByCorpCommodity: Map<string, Map<string, number>> | undefined;
  let settleableAgreements: SettleableSupplyAgreement[] | undefined;
  // Corporation-wide agreements have no state identity. A live LEGACY agreement
  // for a state-local commodity (one signed before contracts named their
  // state) must finish under the legacy national book rather than being
  // silently reinterpreted or broken mid-contract. New agreements for these
  // commodities must name a state at proposal time.
  let stateLocalClearingBlockedByLegacyAgreement = false;
  // Populated during clearing: supplier corpId → scope key → contracted units
  // that actually cleared this turn. Drives the post-clearing premium settlement.
  const contractSettlementByCorp = new Map<string, Map<string, number>>();
  // Plants tier: supplier corpId → scope key → units actually produced this
  // turn (the offered book under plants IS real production). Drives the
  // supply-agreement shortfall penalty, a contract is a promise about goods,
  // so under-PRODUCING against it is the breach, not under-selling it.
  const producedByCorpCommodity = new Map<string, Map<string, number>>();
  // Ticket #1147: the involuntary-constraint ceiling, accumulated on exactly
  // the same corp/commodity keys as `producedByCorpCommodity` so the damages
  // leg can compare like with like. A supplier whose plants were starved of
  // inputs, throttled by a glutted market or struck is billed against what it
  // could have made, not against a nameplate it could never reach.
  const achievableByCorpCommodity = new Map<string, Map<string, number | null>>();
  if (supplyAgreementsEnabled) {
    contractedByCorpCommodity = new Map();
    settleableAgreements = [];
    const loaded = await loadSettleableSupplyAgreements({ db, turn: turn ?? 0, now });
    settleableAgreements = loaded.agreements;
    stateLocalClearingBlockedByLegacyAgreement = loaded.legacyStateLocalAgreementLive;
  }
  // The slice (A2b) only bites when BOTH the master flag and the slice gate are
  // on, accrual can run shadow (A1/A2) with the slice still off.
  const brandLoyaltySliceEnabled =
    brandLoyaltyEnabled && marketGovernorConfig?.brandLoyaltySliceEnabled === true;
  const market = buildMarketContext(marketSystemMode, {
    cap: marketGovernorConfig?.marketGovernorCap,
    rampTurns: marketGovernorConfig?.marketGovernorRampTurns,
    currentTurn: turn ?? gameState?.currentTurn ?? 0,
    glideStartTurn: marketGovernorConfig?.marketGovernorGlideStartTurn,
    glideTurns: marketGovernorConfig?.marketGovernorGlideTurns,
    glideMode: marketGovernorConfig?.marketGovernorGlideMode,
    glideFloor: marketGovernorConfig?.marketGovernorGlideFloor,
  });
  market.explicitPlantCostsEnabled = marketGovernorConfig?.explicitPlantCostsEnabled === true;
  market.commodityFixStage = normalizeCommodityFixStage(marketGovernorConfig?.commodityFixStage);
  market.marketRecoveryStage = normalizeMarketRecoveryStage(
    marketGovernorConfig?.marketRecoveryStage
  );
  market.mediaRegulationEnabled = mediaRegulationEnabled;
  market.mediaEditorialEnabled = mediaEditorialEnabled;
  if (mediaRegulationEnabled) {
    market.mediaRegulationPolicyOptionIndex =
      typeof mediaRegulationPolicy?.policyOptionIndex === "number"
        ? Math.max(0, Math.min(6, Math.trunc(mediaRegulationPolicy.policyOptionIndex)))
        : 3;
    market.mediaFairnessDoctrineEnabled = isFairnessDoctrineInEffect(
      gameState?.currentYear,
      market.mediaRegulationPolicyOptionIndex
    );
  }
  // Canonical freight billing: apportion last turn's state-scoped shipping money onto sectors once, before the per-corp loop, and thread it through the market context. Flag-gated: with the flag off, lookup maps are empty and no billing is computed or persisted.
  if (canonicalFreightBillingEnabled) {
    const billing = buildFreightBillingBySector({
      lookups,
      currentTurn: turn ?? gameState?.currentTurn ?? 0,
      plantsEnabled: market.plantsEnabled,
      currentYear,
      commandEconomyEnabled,
    });
    market.freightBillingChargeBySectorId = billing.chargeBySectorId;
    market.freightBillingCreditBySectorId = billing.creditBySectorId;
  }
  // Resolve group ownership once before clearing and reuse it for NPP decisions.
  const groupMembership = await configureGroupSupply(
    db,
    market,
    marketGovernorConfig?.groupSupplyCoordinationEnabled === true
  );
  // The producer path is read here, before the clearing pre-pass, so a funded
  // turn can skip legacy-only clearing work. It is claimed below, before any
  // producer money moves.
  const producerTurn = turn ?? gameState?.currentTurn ?? 0;
  const producerPath = await loadProducerPath(db, {
    turn: producerTurn,
    worldEpoch: gameState?.worldEpochId,
    liveFromTurn: marketGovernorConfig?.producerMarketLiveFromTurn,
  });
  const {
    clearingInvariantBreaches,
    brandLoyaltyUpdates,
    contractedByCorpCommodity: clearingContractedByCorpCommodity,
    buyerDemandByCorpCommodity,
    politicalMediaSettlementPlans,
  } = runClearingPrePass({
    groupMembership,
    lookups,
    market,
    turn,
    currentYear,
    commandEconomyEnabled,
    freightSettlementActive,
    supplyAgreementsEnabled,
    settleableAgreements,
    contractedByCorpCommodity,
    contractSettlementByCorp,
    producedByCorpCommodity,
    achievableByCorpCommodity,
    stateLocalClearingBlockedByLegacyAgreement,
    brandLoyaltyEnabled,
    brandLoyaltySliceEnabled,
    qualityPremiumPricingEnabled,
    politicalMediaOrders,
    treasuryCashLedgerEnabled,
    fundedProducerTurn: producerPath === "funded",
  });
  // One read, one guarded bulk write and one re-read for the whole turn's
  // plans, instead of two round trips per order. The map below stays keyed by
  // THIS turn's clearing output, exactly as before; the durable copy the saver
  // returns is what a replay settles from.
  await savePoliticalMediaSettlementPlans(db, politicalMediaSettlementPlans);
  const plannedPoliticalMediaOrders = new Map(
    politicalMediaSettlementPlans.map(({ orderId, plan }) => [orderId, plan])
  );
  contractedByCorpCommodity = clearingContractedByCorpCommodity;
  if (mediaEditorialEnabled && !mediaOperatingModelsEnabled && market.editorialOutletsByState) {
    await applyMediaEditorialEffects({
      db,
      turn: turn ?? gameState?.currentTurn ?? 0,
      outletsByState: market.editorialOutletsByState,
    });
  }
  mark("marketContext");

  // Output quality (four pillars): compute per-sector quality → corp
  // averageQuality + per-commodity quality (propagates to next turn's inputs).
  // Independent of clearing; flag-gated. Display/telemetry only in this phase.
  let qualityCorpUpdates = new Map<string, number>();
  let newCommodityQuality: Map<CommodityType, number> | null = null;
  if (sectorQualityEnabled || lookups.productLinesV2Enabled || mediaProductSlatesEnabled) {
    const laggedQ = new Map<CommodityType, number>();
    const qDocs = await db
      .collection("commodityQuality")
      .find<{ commodity: CommodityType; quality: number }>(
        {},
        { projection: { commodity: 1, quality: 1 } }
      )
      .toArray();
    for (const d of qDocs) {
      if (typeof d.quality === "number") laggedQ.set(d.commodity, d.quality);
    }
    const qCorps: import("./brandQualityTurn").QualityCorpInput[] = [];
    for (const [corpId, sectors] of lookups.sectorsByCorp) {
      const corp = lookups.corpById.get(corpId);
      const qSectors = sectors.map((sector) => {
        const rates = getEffectiveStrategyRatesForOperatingModel(
          sector.sectorType,
          sector.strategyId ?? "standard",
          sector.transitionFromStrategyId,
          sector.transitionStartTurn,
          turn ?? 0,
          sector.industryModel,
          sector.mediaDiscriminator
        );
        const outputs = (Object.keys(rates.supply ?? {}) as CommodityType[]).filter(
          (c) => (rates.supply?.[c] ?? 0) > 0
        );
        const inputs = (Object.keys(rates.demand ?? {}) as CommodityType[]).filter(
          (c) => (rates.demand?.[c] ?? 0) > 0
        );
        return {
          sectorId: sector._id.toString(),
          revenueWeight: Math.max(0, sector.revenue),
          wageLevel: typeof sector.wageLevel === "number" ? sector.wageLevel : 1,
          outputs,
          inputs,
        };
      });
      qCorps.push({
        corpId,
        techScore: corp?.rdScore ?? 0,
        operationsStrength: corp?.logisticsStrength ?? 0,
        sectors: qSectors,
      });
    }
    const { corpQuality, commodityQuality, sectorQualityBySectorId } = computeQualityUpdates(
      qCorps,
      laggedQ
    );
    lookups.productSectorQualityById = sectorQualityBySectorId;
    if (sectorQualityEnabled) {
      qualityCorpUpdates = corpQuality;
      newCommodityQuality = commodityQuality;
    }
    // Keep in-memory corp docs current so the history snapshot charts this turn.
    for (const [corpId, q] of corpQuality) {
      const corp = lookups.corpById.get(corpId);
      if (corp) corp.averageQuality = q;
    }
  }

  if (mediaProductSlatesEnabled && lookups.mediaProductProjectsByCorpId) {
    await processMediaProductProjectsV1({
      db,
      corporations: lookups.corporations,
      projectsByCorporationId: lookups.mediaProductProjectsByCorpId,
      currentTurn: turn ?? 1,
      sectorQualityBySectorId: lookups.productSectorQualityById ?? new Map(),
      advertisingEfficacyByCorporationId: advertisingEfficacyByCorpId,
    });
    const projectsBySectorId = new Map<
      string,
      import("@/lib/products/mediaProduct").MediaProductProject[]
    >();
    const developmentByCorpId = new Map<
      string,
      import("@/lib/products/mediaProduct").MediaProductProject
    >();
    for (const [corporationId, projects] of lookups.mediaProductProjectsByCorpId) {
      for (const project of projects) {
        const sectorProjects = projectsBySectorId.get(project.sectorId) ?? [];
        sectorProjects.push(project);
        projectsBySectorId.set(project.sectorId, sectorProjects);
        if (project.activeDevelopmentCorporationId) {
          developmentByCorpId.set(corporationId, project);
        }
      }
    }
    lookups.mediaProductProjectsBySectorId = projectsBySectorId;
    lookups.mediaProductDevelopmentByCorpId = developmentByCorpId;
    const mediaProductQualityBySectorId = new Map<string, number>();
    const mediaProductLoyaltyBonusBySectorId = new Map<string, number>();
    for (const sectors of lookups.sectorsByCorp.values()) {
      for (const sector of sectors) {
        const sectorId = sector._id.toString();
        const projects = (projectsBySectorId.get(sectorId) ?? []).flatMap((project) => {
          const kind = getMediaProductKind(project.kindId);
          return kind && sector.strategyId === kind.modelId
            ? [{ project: { ...project, id: project._id }, kind }]
            : [];
        });
        if (projects.length === 0) continue;
        const effect = aggregateMediaProductSectorEffects({
          projects,
          baseQuality: lookups.productSectorQualityById?.get(sectorId) ?? null,
        });
        if (effect.quality !== null) mediaProductQualityBySectorId.set(sectorId, effect.quality);
        if (effect.loyaltyBonus > 0) {
          mediaProductLoyaltyBonusBySectorId.set(sectorId, effect.loyaltyBonus);
        }
      }
    }
    lookups.mediaProductQualityBySectorId = mediaProductQualityBySectorId;
    lookups.mediaProductLoyaltyBonusBySectorId = mediaProductLoyaltyBonusBySectorId;
  }

  // Phase 1a2: auto-install NPP caretakers on corps left CEO-less by a hard
  // departure (retire/relocate/resign/residency/deletion/ban set ceoVacant), so
  // they run via the clamped NPP brain instead of shedding to unowned. Mutates
  // the in-memory corp docs, so it must precede the vacant/inactive sheds below.
  // Inactivity never sets ceoVacant, so idle-but-seated CEOs are not covered.
  const { installed: caretakersInstalled } = await installCaretakersForVacantCorps(db, lookups, {
    turn: turn ?? 0,
    now,
  });
  if (caretakersInstalled > 0) {
    console.log(
      `[corporationTurn] auto-installed ${caretakersInstalled} NPP caretaker(s) on vacant corp(s)`
    );
  }
  mark("autoCaretaker");

  // NPP engine 6: NPP-run plants right-size structural overcapacity.
  lookups.engineSixCountries = await loadEngineSixCountries(db, lookups.corporations);

  // NPP engine 6 bookkeeping: once a game day, fold each NPP CEO's margin
  // against sector peers into its CEO track record. Reads last turn's sector
  // results from the snapshot, before the sheds below mutate it. No decision
  // reads it below v6, so a failure only loses one sample.
  await runNppCeoCareerPasses(db, lookups, turn ?? 0);
  mark("nppCeoTrackRecord");

  // Forensics/alt-detection audit spine: aggregate, not-per-corp entries for
  // this turn's silent auto-mutations (vacant/inactive-CEO shedding, NPP
  // caretaker installs, subsidiary cleanup). Batched into one `recordAuditBulk`
  // at the end to avoid N+1 writes on the corp-turn hotspot.
  const corpAuditEntries: ActionAuditInput[] = [];
  if (caretakersInstalled > 0) {
    corpAuditEntries.push({
      source: "turn",
      category: "corp",
      action: "corp.auto_caretaker_install",
      phase: "corporationTurn",
      subject: { type: "corpBatch", name: "vacant-ceo corps" },
      outcome: "ok",
      meta: { count: caretakersInstalled },
    });
  }

  // Phase 1b: CEO-less player corps lose market footprint to unowned pools (same turn as step 2)
  // MUTATES lookups.sectorsByCorp, adjusts revenue/workers so processSectors sees reduced values.
  // Order matters: vacant shed runs first, then inactive-CEO shed (which excludes vacant corps).
  const vacantShedResult = await shedVacantCeoSectorsToUnowned(
    db,
    lookups,
    now,
    market.plantsEnabled
  );
  const inactiveShedResult = await shedInactiveCeoSectorsToUnowned(
    db,
    lookups,
    now,
    market.plantsEnabled
  );
  if (vacantShedResult.corporateSectorsUpdated > 0) {
    corpAuditEntries.push({
      source: "turn",
      category: "corp",
      action: "corp.auto_sector_shed",
      phase: "corporationTurn",
      subject: { type: "corpBatch", name: "vacant-ceo sector shed" },
      outcome: "ok",
      meta: {
        reason: "vacant_ceo",
        sectorsUpdated: vacantShedResult.corporateSectorsUpdated,
        revenueShed: Math.round(vacantShedResult.totalRevenueShed),
      },
    });
  }
  if (inactiveShedResult.corporateSectorsUpdated > 0) {
    corpAuditEntries.push({
      source: "turn",
      category: "corp",
      action: "corp.auto_sector_shed",
      phase: "corporationTurn",
      subject: { type: "corpBatch", name: "inactive-ceo sector shed" },
      outcome: "ok",
      meta: {
        reason: "inactive_ceo",
        sectorsUpdated: inactiveShedResult.corporateSectorsUpdated,
        revenueShed: Math.round(inactiveShedResult.totalRevenueShed),
      },
    });
  }
  mark("shedSectors");

  // Phase 2: Process all corporations and sectors (pure computation, no DB calls)
  // Funded-market cutover: one producer path per turn, claimed before any
  // producer money moves. On a funded turn the market settles first and the
  // legacy pass takes revenue and margin from its receipts.
  if (gameState?.worldEpochId)
    await claimProducerPath(db, {
      worldEpoch: gameState.worldEpochId,
      turn: producerTurn,
      path: producerPath,
      phase: "corporation",
    });
  let funded: Awaited<ReturnType<typeof runFundedProducerTurn>> | undefined;
  if (producerPath === "funded") {
    if (market.marketRecoveryStage)
      throw new Error("marketRecoveryStage must be 0 on a funded producer turn");
    const worldEpoch = gameState!.worldEpochId!;
    const transitionAnchor = transitionAnchorTurn(
      gameState?.producerOpening?.worldEpoch === worldEpoch
        ? gameState.producerOpening.turn + 1
        : undefined,
      marketGovernorConfig?.producerTransitionPackageEnabled
    );
    const earlier = await db
      .collection("producerEconomyTurns")
      .findOne({ worldEpoch, turn: { $lt: producerTurn } }, { projection: { _id: 1 } });
    // A failed funded settlement must stop the turn: advancing would leave every
    // plant a generation behind, so no later funded turn could reconcile.
    funded = await runFundedProducerTurn(db, {
      withholdCorporateTax: treasuryCashLedgerEnabled,
      turn: producerTurn,
      worldEpoch,
      lookups,
      // Fresh collectors: the legacy pass below records labour telemetry once.
      env: {
        lookups,
        currentTurn: producerTurn,
        currentYear,
        techTreesEnabled: true,
        labour,
        wageIndexByState: new Map(),
        automationIndexByState: new Map(),
        pendingStrikeEvents: [],
        labourDemandByState: makeLabourDemandByState(),
        labourDemandWageIndexByState: new Map(),
        privateBankingEnabled,
        advertisingInput: true,
        ...producerStageEnv(marketGovernorConfig),
        transitionFirstFundedTurn: transitionAnchor,
      } as unknown as ProducerPhysicalEnv,
      seedHouseholds: earlier == null,
      firstFundedTurn: transitionAnchor,
    }).catch((error: unknown) => {
      throw new TurnMustStopError("corporationTurn", error);
    });
    mark("fundedProducerMarket");
  }
  const {
    sectorOps,
    corpOps,
    manufacturingDevelopmentCashOps,
    corpSnapshots,
    ceoSalaryPayments,
    dividendPayments,
    capitalDividendPayments,
    passThroughTaxedDividendPayments,
    corpDividendPaymentsAnchorByCorpId,
    corpDividendTaxedAtSourceAnchorByCorpId,
    corpDividendPaymentsAnchorByCorpCurrency,
    sectorFxSpreadFees,
    fundDividendAccruals,
    equityPoolDividendAccruals,
    domesticIncomeByCountry,
    foreignIncomeByCountry,
    domesticIncomeByOperatingState,
    foreignIncomeByOperatingState,
    growthInvestmentByOperatingState,
    totalRevenueGenerated,
    totalIncomeGenerated,
    sectorsProcessed,
    profitMarginByCorpId,
    labourWageIndexByState,
    automationIndexByState,
    labourDemandByState,
    labourDemandWageIndexByState,
    automationDisplacedByState,
    strikeEvents,
    capacityBindingEvents,
    settledMarketingSpendAnchorByBuyerId,
    advertisingDeliveredAnchorBySellerId,
    sectorTurnEnv,
  } = processSectors(
    lookups,
    turn,
    now,
    true,
    currentYear,
    labour,
    market,
    commandEconomyEnabled,
    privateBankingEnabled,
    new Set(equityPoolTurn.activeCurrencies),
    treasuryCashLedgerEnabled,
    funded
  );
  mark("processSectors(CPU)");
  // The previous turn's deferred shadow must land before this one reads it.
  const { nppNewSectors } = await runCorporationTurnSideEffects({
    db,
    funded,
    marketGovernorConfig,
    phaseStartedAt,
    turn,
    gameState,
    lookups,
    sectorTurnEnv,
    sectorOps,
    now,
    techTreesEnabled: true,
    groupMembership,
    corpSnapshots,
    treasuryCashLedgerEnabled,
    options,
    mark,
    corpOps,
    market,
    brandLoyaltyUpdates,
    qualityCorpUpdates,
    labour,
    labourWageIndexByState,
    automationIndexByState,
    labourDemandByState,
    labourDemandWageIndexByState,
    automationDisplacedByState,
    manufacturingDevelopmentCashOps,
    mediaProductSlatesEnabled,
    productVentureDomainsEnabled,
    plantsEnabledForMarketShare,
    corpAuditEntries,
    equityPoolDividendAccruals,
    mediaOperatingModelsEnabled,
    currentYear,
    advertisingDeliveredAnchorBySellerId,
    settledMarketingSpendAnchorByBuyerId,
    politicalMediaMarketEnabled,
    politicalMediaOrders,
    plannedPoliticalMediaOrders,
    mediaEditorialEnabled,
    newCommodityQuality,
    sectorFxSpreadFees,
    strikeEvents,
  });

  // Notify player-owned extraction sectors that newly hit a capacity ceiling
  // this turn, their realized resource revenue is now being throttled by the
  // capacity haircut, so the CEO should acquire capacity, adopt a focused
  // extraction strategy, or expand elsewhere. Skips NPP/natcorp-run sectors.
  const { currencyIncomeInternalByCharacterId, currencyIncomeFaceByCharacterId } =
    await settleCorporationTurnPayouts({
      capacityBindingEvents,
      lookups,
      turn,
      nppNewSectors,
      db,
      profitMarginByCorpId,
      mark,
      now,
      gameState,
      currentYear,
      corpSnapshots,
      corpAuditEntries,
      market,
      fundDividendAccruals,
      corpDividendPaymentsAnchorByCorpId,
      corpDividendPaymentsAnchorByCorpCurrency,
      corpDividendTaxedAtSourceAnchorByCorpId,
      thresholds,
      supplyAgreementsEnabled,
      settleableAgreements,
      contractSettlementByCorp,
      buyerDemandByCorpCommodity,
      producedByCorpCommodity,
      achievableByCorpCommodity,
      domesticIncomeByCountry,
      foreignIncomeByCountry,
      domesticIncomeByOperatingState,
      foreignIncomeByOperatingState,
      growthInvestmentByOperatingState,
      ceoSalaryPayments,
      dividendPayments,
      capitalDividendPayments,
      passThroughTaxedDividendPayments,
      forexEnabled,
    });

  timer.finish(turn);

  return {
    corporationsProcessed: lookups.corporations.length,
    sectorsProcessed,
    totalRevenueGenerated: Math.round(totalRevenueGenerated),
    totalIncomeGenerated: Math.round(totalIncomeGenerated),
    currencyIncomeInternalByCharacterId,
    currencyIncomeFaceByCharacterId,
    // Market planning/ownership diagnostics join clearing invariant warnings.
    turnWarnings: [...clearingInvariantBreaches, ...(funded?.turnWarnings ?? [])],
  };
}
