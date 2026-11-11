/** Extraction capacity, portfolio and freight lookups for the corporation turn. */
import type {
  CorporateSector,
  Corporation,
  StateResourceCapacity,
  Bond,
  State,
  GameState,
} from "@/lib/db/types";
import type { Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  type ExtractableResource,
  eraScaledBasePrices,
  EXTRACTABLE_RESOURCES,
  SECTOR_SUPPLY,
  extractionOutputScaleFor,
} from "@/lib/constants/commodities";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { getExtractionOutputScaleEnabled } from "@/lib/market/featureFlag";
import { extractionRevenueAnchorOf } from "@/lib/extraction/revenueAnchor";
import {
  getExtractionContractsCollection,
  activeExtractionContractFilter,
} from "@/lib/db/collections/extractionContracts";
import {
  type ExtractionSectorInput,
  fullOutputMultipliers,
  computeExtractionCapacityMultipliers,
} from "@/lib/turn/extraction/extractionCapacity";
import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
import { activeCapacityFraction } from "@/lib/corporations/investment/rules";
import { depletedCapacityDoc } from "@/lib/extraction/depletion";
import {
  haircutScarcityRelief,
  limitExtractionUtilizationRise,
  scarcityReliefCappedUtilization,
} from "@/lib/extraction/capacityHaircut";
import {
  buildImfPrincipalAnchorByLenderCorpId,
  buildBondAndImfPortfolioAnchorByCorpId,
  buildCrossCorpStockHoldingsByHolderCorpId,
  buildPortfolioAnchorValueByCorpId,
} from "@/lib/corporations/portfolioAnchorValuation";
import { buildFtaCoverageLookup } from "@/lib/tariffs/ftaOverrides";
import type { Crisis } from "@/lib/db/types/crisis";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { buildDisasterEffectsByState } from "@/lib/crises/disasterMarginPenalty";
import { loadScarOutputEntries } from "@/lib/crises/scarOutput";
import { resolveGameYear } from "@/lib/era/era";
import { climateProfileForStartingYear } from "@/lib/crises/rules/climateFeedback";
import type { CorporationLookups } from "./types";
import type { ClimateFeedbackState } from "@/lib/crises/climateTurn";
import {
  loadTransitionPolicies,
  summarisePowerFleet,
  renewablesReliabilityEntry,
} from "@/lib/energyTransition/policies";
import {
  climateExposureFromTags,
  climateEffectEntries,
  energyDemandMultiplier,
} from "@/lib/crises/rules/climateEffects";
import { getClimateExposureTags } from "@/lib/crises/regionHazards";
import { loadCabinetGameplayEffects } from "@/lib/resetCabinet/loadGameplayEffects";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import {
  applyCabinetPoliticalInputs,
  cabinetEffectsForRegion,
} from "@/lib/resetCabinet/rules/gameplay";
import { buildPoliticalBaseModifiers } from "@/lib/politicalLegislation/marginAdapter";
import { RESET_V2_COUNTRIES, resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import type { ResetMetricSnapshot } from "@/lib/resetMetrics/rules/snapshot";
import {
  RESET_APPROVAL_BOARD_PROJECTION,
  loadResetApprovalModifiers,
} from "@/lib/resetMetrics/loadApprovalModifiers";
import {
  ownedPoliticalModifiers,
  ownedPoliticalValues,
} from "@/lib/resetMetrics/rules/ownedInputs";
import { evaluateModifiers } from "@/lib/utils/approvalModifiers";
import { buildFlatMetrics } from "@/lib/utils/governmentApproval";
import { computeRegionalConditionMargin } from "@/lib/states/conditions/marginEffects";
import type { WithId } from "mongodb";
import type { StateMetrics } from "@/lib/db/types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { crisesCollection } from "@/lib/db/repositories/crises";
import { politicalMetricsCollection } from "@/lib/db/repositories/politicalMetrics";
import { resetMetricSnapshotsCollection } from "@/lib/db/repositories/resetMetricSnapshots";
import { climateFeedbackStateCollection } from "@/lib/db/repositories/climateFeedbackState";

/** Builds extraction capacity utilisation, corporate portfolio values and the remaining per-corporation lookups. */
export async function buildExtractionAndPortfolioLookups({
  allSectors,
  options,
  db,
  eraUnitScale,
  corpById,
  exchangeRatesByCurrency,
  stateResourceCapacityDocs,
  globalCommodityBalances,
  corporations,
  bondsHeldByCorpId,
  activeFtaPairs,
  states,
  allStateMetrics,
}: {
  allSectors: WithId<CorporateSector>[];
  options:
    | {
        omitBuildQueue?: boolean;
        plantsEnabled?: boolean;
        explicitPlantCostsEnabled?: boolean;
        productionTurn?: number;
        moneyWiringEnabled?: boolean;
        productLinesV2Enabled?: boolean;
        mediaProductSlatesEnabled?: boolean;
        freightSettlementActive?: boolean;
        canonicalFreightBillingEnabled?: boolean;
        mediaEditorialEnabled?: boolean;
        politicalMediaMarketEnabled?: boolean;
      }
    | undefined;
  db: Db;
  eraUnitScale: number;
  corpById: Map<string, WithId<Corporation>>;
  exchangeRatesByCurrency: Map<CurrencyCode, number>;
  stateResourceCapacityDocs: WithId<StateResourceCapacity>[];
  globalCommodityBalances: Map<
    | "steel"
    | "electronics"
    | "energy"
    | "chemicals"
    | "pharmaceuticals"
    | "fertilizers"
    | "food"
    | "building_materials"
    | "construction_services"
    | "healthcare_services"
    | "real_estate_services"
    | "software"
    | "financial_services"
    | "advertising"
    | "vehicles"
    | "retail"
    | "freight"
    | "consulting_services"
    | "iron"
    | "coal"
    | "oil"
    | "rare_earth"
    | "timber"
    | "natural_gas"
    | "ordnance"
    | "plastics"
    | "network_services",
    { supply: number; demand: number }
  >;
  corporations: WithId<Corporation>[];
  bondsHeldByCorpId: Map<string, { bond: Bond; units: number }[]>;
  activeFtaPairs: Set<string>;
  states: WithId<State>[];
  allStateMetrics: StateMetrics[];
}) {
  const extractionSectors = allSectors.filter((s) => s.sectorType === "extraction");
  const extractionCapacityUtilBySector = new Map<
    string,
    { utilization: number; bindingResource: ExtractableResource | null }
  >();
  if (extractionSectors.length > 0) {
    const capacityTurn = options?.productionTurn ?? (await getCurrentTurn(db));
    // Mirror the supply-ledger input exactly (commodityPriceTurn): the
    // extraction output-scale flag gates the per-resource boost, and the
    // ₳↔unit conversion runs on this world's ERA base-price table. The
    // previous modern-table figure here was 70-174x smaller than what the
    // ledger books on a 1953 world, so this clamp rationed against a
    // fraction of the sector's real desired output and never bound.
    const extractionOutputScaleEnabled = await getExtractionOutputScaleEnabled();
    const extractionBasePrices = eraScaledBasePrices(eraUnitScale);
    // The ledger anchor-normalizes revenue before dividing by ₳ base prices
    // (buildSectorRows); this clamp must too, or a non-USD miner's desired
    // output is inflated by its exchange rate and it reads as far over its
    // deposit (live: 46 mines, mostly yen, lira and peseta).
    const extractionRevenueAnchor = extractionRevenueAnchorOf(corpById, exchangeRatesByCurrency);
    const extractionStateIds = [...new Set(extractionSectors.map((s) => s.stateId))];
    const activeContracts = await (
      await getExtractionContractsCollection(db)
    )
      .find({ stateId: { $in: extractionStateIds }, ...activeExtractionContractFilter() })
      .toArray();
    // Resolve each extraction sector's effective supply rates once, then reuse
    // them for both the capacity clamp input and the revenue-weighted utilization.
    const ratesBySector = new Map<string, Partial<Record<ExtractableResource, number>>>();
    const outputUnitsBySector = new Map<string, Partial<Record<ExtractableResource, number>>>();
    const extractionInputs: ExtractionSectorInput[] = extractionSectors.map((sector) => {
      const hasStrategy = sector.strategyId && sector.strategyId !== "standard";
      const strategyRates =
        hasStrategy || sector.transitionFromStrategyId
          ? getEffectiveStrategyRates(
              "extraction",
              sector.strategyId ?? "standard",
              sector.transitionFromStrategyId,
              sector.transitionStartTurn,
              capacityTurn
            )
          : null;
      const rates: Partial<Record<ExtractableResource, number>> = {};
      const revenueBasedOutput: Partial<Record<ExtractableResource, number>> = {};
      for (const resource of EXTRACTABLE_RESOURCES) {
        const rate = strategyRates
          ? (strategyRates.supply[resource] ?? 0)
          : ((SECTOR_SUPPLY["extraction"] ?? []).find((f) => f.commodity === resource)?.rate ?? 0);
        if (rate > 0) {
          rates[resource] = rate;
          // Identical expression to the ledger path: revenue x rate x
          // per-resource output scale, over the era-scaled base price. At
          // eraUnitScale 1 the table IS COMMODITY_BASE_PRICES and the scale
          // follows the same config flag as the ledger, so modern worlds are
          // unchanged whenever the ledger is.
          revenueBasedOutput[resource] =
            (extractionRevenueAnchor(sector) *
              rate *
              extractionOutputScaleFor(resource, extractionOutputScaleEnabled)) /
            extractionBasePrices[resource];
        }
      }
      const sectorId = sector._id.toString();
      ratesBySector.set(sectorId, rates);
      outputUnitsBySector.set(sectorId, revenueBasedOutput);
      // Plants: parked or mothballed capacity digs nothing, so it does
      // not claim a share of the deposit. This turn's demand throttle is not
      // known yet here; the ledger caps at real output.
      let plantOutputCap: ExtractionSectorInput["plantOutputCap"];
      if (options?.plantsEnabled === true) {
        const active = activeCapacityFraction(sector);
        plantOutputCap = {};
        for (const [resource, units] of Object.entries(revenueBasedOutput) as [
          ExtractableResource,
          number,
        ][]) {
          plantOutputCap[resource] = units * active;
        }
      }
      return {
        sectorId,
        stateId: sector.stateId,
        corporationId: sector.corporationId,
        revenueBasedOutput,
        ...(plantOutputCap ? { plantOutputCap } : {}),
      };
    });
    // P3b: under plants the corp phase rations against the DEPLETION-ADJUSTED
    // ceiling, matching what commodityPriceTurn books the extraction against.
    // Without this the sector's revenue-side utilization and the world's supply
    // ledger would disagree about how much ore is left. Below plants the raw
    // docs are used, byte-identically.
    // Utilization below stays a share of FULL output (the plants hard-min
    // divides it by the active fraction), so capped grants are re-expressed.
    const multipliers = fullOutputMultipliers(
      extractionInputs,
      computeExtractionCapacityMultipliers(
        extractionInputs,
        activeContracts,
        options?.plantsEnabled === true
          ? stateResourceCapacityDocs.map(depletedCapacityDoc)
          : stateResourceCapacityDocs
      )
    );
    // Scarcity relief: lift the haircut off resources in global shortage
    // (lagged balances — same one-turn lag as every market input) so the
    // haircut stops taxing exactly the extraction the economy is short of.
    const reliefByResource: Partial<Record<ExtractableResource, number>> = {};
    for (const resource of EXTRACTABLE_RESOURCES) {
      const bal = globalCommodityBalances.get(resource);
      const relief = haircutScarcityRelief(bal?.supply, bal?.demand);
      if (relief > 0) reliefByResource[resource] = relief;
    }
    const priorUtilizationBySector = new Map(
      extractionSectors.map((sector) => [sector._id.toString(), sector.capacityUtilization])
    );
    for (const [sectorId, rates] of ratesBySector) {
      // Relief is capped at the raw capacity ratio over the CORRECTED
      // desired-output units: a sector whose desired output exceeds its
      // state's deposit ceiling cannot have the haircut lifted past what
      // those deposits can actually yield. A rise eases in from last turn's
      // persisted reading; a fall applies at once.
      extractionCapacityUtilBySector.set(
        sectorId,
        limitExtractionUtilizationRise(
          scarcityReliefCappedUtilization(
            rates,
            multipliers.get(sectorId),
            reliefByResource,
            outputUnitsBySector.get(sectorId)
          ),
          priorUtilizationBySector.get(sectorId)
        )
      );
    }
  }

  const imfPrincipalAnchorByLenderCorpId = buildImfPrincipalAnchorByLenderCorpId(
    corporations,
    exchangeRatesByCurrency
  );
  const bondAndImfPortfolioAnchorByCorpId = buildBondAndImfPortfolioAnchorByCorpId(
    bondsHeldByCorpId,
    imfPrincipalAnchorByLenderCorpId,
    exchangeRatesByCurrency
  );
  const crossCorpStockHoldingsByHolderCorpId =
    buildCrossCorpStockHoldingsByHolderCorpId(corporations);
  const portfolioAnchorValueByCorpId = buildPortfolioAnchorValueByCorpId(
    corporations,
    bondsHeldByCorpId,
    imfPrincipalAnchorByLenderCorpId,
    exchangeRatesByCurrency
  );

  // FTA coverage shares — used by getDomesticTariffMalus and getTariffBlendWeights
  // to scale supply-chain friction and commodity-blend tilt by partner exposure.
  // Built from already-loaded sectors + corpById; no extra DB roundtrips.
  const ftaCoverage = buildFtaCoverageLookup(allSectors, corpById, activeFtaPairs);

  // Active crisis decay margin effects indexed by stateId. One batched query;
  // no per-sector reads. Covers ALL active crises (auto-spawned disasters,
  // auto-crises, and admin-created crises) that carry a decay `profitMargin`
  // effect with a non-null `durationTurns`. The scope-aware resolver expands a
  // crisis to its affected states: global → every real state, country → that
  // country's states, region → its `regionIds`. So an economic crisis (Pandemic,
  // Recession, …) hits every corp in scope, not just region disasters.
  const disasterCrises = await crisesCollection(db).find({ status: "active" }).toArray();
  const realStateIds: string[] = [];
  const stateIdsByCountry = new Map<string, string[]>();
  for (const s of states) {
    const id = String(s._id);
    if (NATIONAL_SCOPE_IDS.has(id)) continue;
    realStateIds.push(id);
    const arr = stateIdsByCountry.get(s.countryId) ?? [];
    arr.push(id);
    stateIdsByCountry.set(s.countryId, arr);
  }
  const resolveCrisisStateIds = (
    c: Pick<Crisis, "scope" | "countryIds" | "regionIds">
  ): readonly string[] =>
    c.scope === "global"
      ? realStateIds
      : c.scope === "country"
        ? c.countryIds.flatMap((cid) => stateIdsByCountry.get(cid) ?? [])
        : c.regionIds;
  const activeDisasterEffectsByState = buildDisasterEffectsByState(
    disasterCrises,
    resolveCrisisStateIds
  );
  const scarEntries = await loadScarOutputEntries(
    db,
    options?.productionTurn ?? (await getCurrentTurn(db)),
    stateIdsByCountry
  );
  for (const [stateId, entries] of scarEntries) {
    activeDisasterEffectsByState.set(stateId, [
      ...(activeDisasterEffectsByState.get(stateId) ?? []),
      ...entries,
    ]);
  }

  const gameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: {
        preset: 1,
        hardwareInputReliefStartTurn: 1,
        stockHoldingTaxStartTurn: 1,
        passThroughOwnerTaxStartTurn: 1,
        nppCeoPayStartTurn: 1,
        currentYear: 1,
        currentTurn: 1,
        startingYear: 1,
        resetWorldId: 1,
        resetVersionSeeds: 1,
        metricsSystemVersion: 1,
        cabinetSystemVersion: 1,
        isProcessing: 1,
        processingKind: 1,
        processingTargetTurn: 1,
      },
    }
  );
  // Live year for era-aware regional-condition margins; null while the flag is off.
  const eraYear = gameState ? resolveGameYear(gameState) : null;

  // Standing climate effects for worlds that opt in (the 2027 world): farm
  // yield loss and insurance premiums ride the disaster-effect channel, and
  // heat lifts household energy demand. One extra read, only when opted in.
  const climateEnergyDemandByState = new Map<string, number>();
  const climateProfile = climateProfileForStartingYear(gameState?.startingYear);
  let energyTransition: CorporationLookups["energyTransition"];
  if (climateProfile.broaderEffects) {
    const [climate, transitionPolicyByCountry] = await Promise.all([
      climateFeedbackStateCollection<ClimateFeedbackState>(db).findOne(
        { _id: "world" },
        { projection: { pressure: 1 } }
      ),
      loadTransitionPolicies(db),
    ]);
    // Energy transition (same opt-in): climate laws and the national clean
    // share price each sector's inputs in sectorTurn; renewables without
    // firming lose output through the disaster-effect channel below.
    const fleet = summarisePowerFleet(allSectors);
    energyTransition = {
      // broaderEffects is only on for a world with a known starting year.
      startingYear: gameState?.startingYear ?? 0,
      policyByCountry: transitionPolicyByCountry,
      cleanShareByCountry: fleet.cleanShareByCountry,
    };
    for (const [stateId, penalty] of fleet.renewablesPenaltyByState)
      activeDisasterEffectsByState.set(stateId, [
        ...(activeDisasterEffectsByState.get(stateId) ?? []),
        renewablesReliabilityEntry(penalty),
      ]);
    const pressure = climate?.pressure ?? climateProfile.startingPressure;
    for (const s of states) {
      const id = String(s._id);
      if (NATIONAL_SCOPE_IDS.has(id)) continue;
      const exposure = climateExposureFromTags(getClimateExposureTags(s.countryId, id));
      const entries = climateEffectEntries(pressure, exposure);
      if (entries.length > 0)
        activeDisasterEffectsByState.set(id, [
          ...(activeDisasterEffectsByState.get(id) ?? []),
          ...entries,
        ]);
      const energy = energyDemandMultiplier(pressure, exposure);
      if (energy !== 1) climateEnergyDemandByState.set(id, energy);
    }
  }

  // SP4 §4a: political margin overlays for playable regions — the sector-margin
  // engine resolves demolished political signals from these instead of the
  // (stripped) stateMetrics docs. One batch read, one map per region.
  const cabinetEffects = await loadCabinetGameplayEffects(db, gameState, options?.productionTurn);
  const politicalDocs = (await politicalMetricsCollection(db).find({}).toArray()).map((doc) => ({
    ...doc,
    values: applyCabinetPoliticalInputs(
      doc.values,
      cabinetEffectsForRegion(cabinetEffects, doc.countryId, String(doc._id))
    ),
  }));
  const politicalBaseModifiersByState = new Map(
    politicalDocs.map((doc) => [String(doc._id), buildPoliticalBaseModifiers(doc.values)])
  );
  const politicalBoardByState = new Map(politicalDocs.map((doc) => [String(doc._id), doc.values]));
  const resetCountries = RESET_V2_COUNTRIES.filter(
    (country) => resetSystemVersionsForCountry(gameState, RESET_V2_READY, country).metrics === "v2"
  );
  const resetBoards =
    resetCountries.length > 0
      ? await resetMetricSnapshotsCollection<ResetMetricSnapshot>(db)
          .find(
            { worldId: gameState!.resetWorldId, countryId: { $in: resetCountries } },
            {
              projection: RESET_APPROVAL_BOARD_PROJECTION,
            }
          )
          .toArray()
      : [];
  const politicalById = new Map(politicalDocs.map((doc) => [String(doc._id), doc]));
  for (const board of resetBoards) {
    if (board.scope !== "regional" || !board.regionId) continue;
    const prior = politicalById.get(board.regionId);
    if (!prior || prior.countryId !== board.countryId) continue;
    politicalBaseModifiersByState.set(
      board.regionId,
      ownedPoliticalModifiers(
        prior.values,
        board.observations,
        board.countryId,
        eraYear ?? gameState?.currentYear ?? 1991
      )
    );
    politicalBoardByState.set(
      board.regionId,
      ownedPoliticalValues(
        prior.values,
        board.observations,
        board.countryId,
        eraYear ?? gameState?.currentYear ?? 1991
      )
    );
  }
  const resetConditions = new Map(
    await Promise.all(
      resetCountries.map(
        async (country) =>
          [
            country,
            await loadResetApprovalModifiers(
              db,
              country,
              allStateMetrics
                .filter(
                  (metrics) =>
                    metrics.countryId === country && !NATIONAL_SCOPE_IDS.has(String(metrics._id))
                )
                .map((metrics) => String(metrics._id)),
              gameState,
              undefined,
              resetBoards,
              cabinetEffects
            ),
          ] as const
      )
    )
  );
  const regionalConditionMarginByState = new Map<string, number>();
  for (const metrics of allStateMetrics) {
    const stateId = String(metrics._id);
    if (NATIONAL_SCOPE_IDS.has(stateId)) continue;
    const modifiers =
      resetConditions
        .get(metrics.countryId as (typeof RESET_V2_COUNTRIES)[number])
        ?.modifiersByRegion.get(stateId) ??
      evaluateModifiers(buildFlatMetrics(metrics), {
        preset: gameState?.preset,
        countryId: metrics.countryId,
        year: eraYear,
      });
    regionalConditionMarginByState.set(stateId, computeRegionalConditionMargin(modifiers));
  }
  return {
    gameState,
    eraYear,
    portfolioAnchorValueByCorpId,
    bondAndImfPortfolioAnchorByCorpId,
    crossCorpStockHoldingsByHolderCorpId,
    politicalBaseModifiersByState,
    politicalBoardByState,
    ftaCoverage,
    extractionCapacityUtilBySector,
    activeDisasterEffectsByState,
    climateProfile,
    climateEnergyDemandByState,
    energyTransition,
    regionalConditionMarginByState,
  };
}
