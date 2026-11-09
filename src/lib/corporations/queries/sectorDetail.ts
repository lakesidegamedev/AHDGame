import { corpCanProspect } from "@/lib/constants/prospecting";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { loadCommandEconomyBlockedCountries } from "@/lib/economy/queries/commandEconomyMarketGate";
import { isPrivateEnterpriseBlocked } from "@/lib/economy/queries/privateEnterpriseGate";
import { isLabourWagesEnabled, isLabourFullMode } from "@/lib/labour/featureFlag";
import { undergroundUnrestVisible } from "@/lib/unions/enforcementCosts";
import { isProspectingEnabled } from "@/lib/extraction/featureFlag";
import {
  clampWageLevel,
  sectorWageLevel,
  MEDIAN_SECTOR_WAGE_LEVEL,
  minWageFloorMultiplier,
} from "@/lib/labour/laborCost";
import { employmentStaffingTightness } from "@/lib/labour/rules/employment";
import { buildStateLabourPoolView } from "@/lib/labour/rules/stateLabourPool";
import type { Corporation, CorporateSector, FederalBudget } from "@/lib/db/types";
import {
  getTariffBlendWeights,
  buildSectorPresenceKeys,
  tariffRulesNeedSectorPresenceKeys,
} from "@/lib/tariffs/tariffEffects";
import { buildFtaCoverageLookup } from "@/lib/tariffs/ftaOverrides";
import { OPERATING_SECTOR_TYPE_LABELS, calculateWorkers } from "@/lib/constants/corporations";
import type { OperatingSectorType, StateMetricValues } from "@/lib/constants/corporations";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import {
  computeOwnershipMarginTerms,
  roundOwnershipTerms,
} from "@/lib/nationalization/ownershipMarginTerms";
import { loadEconomicModelsByCountry } from "@/lib/economicModels/queries";
import { type CommodityType } from "@/lib/constants/commodities";
import type { CountryId } from "@/lib/constants/countries";
import type { GameConfig } from "@/lib/db/types";
import { resolveMinWageRatioByCountry } from "@/lib/labour/minimumWageLaws";
import {
  getEffectiveStrategyRatesForOperatingModel,
  getOperatingSectorType,
  plannedEconomyMediaSupplyFactor,
} from "@/lib/constants/sectorStrategies";
import { isPlannedEconomy } from "@/lib/constants/commandEconomy";
import { loadReceiptLanePrices } from "@/lib/corporations/queries/receiptLanePrices";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import { resolvePresetIdFromGameState } from "@/lib/world/countryReadinessContract";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { getNationalCommodityBalance } from "@/lib/commodity-map";
import { buildDepositCapacityRows } from "@/lib/corporations/strategyRevenuePreview";
import { redactPrivateCorporation } from "@/lib/corporations/redaction";
import { computeSectorExtractionCapacityContext } from "@/lib/corporations/queries/sectorDetailExtraction";
import {
  computeResourceOpportunities,
  type ResourceOpportunity,
} from "@/lib/corporations/queries/extractionOpportunities";
import type { ExtractableResource } from "@/lib/constants/commodities";
import { buildSectorCommoditySections } from "@/lib/corporations/queries/sectorDetailCommodities";
import { sectorEconomicRevenue } from "@/lib/corporations/sectorRevenueBasis";
import { scaleSiteStatement } from "@/lib/corporations/rules/siteStatement";
import {
  buildSectorAttackInfo,
  buildSectorCrisisSection,
  buildSectorForSaleInfo,
  buildSectorStrategySection,
  computeSectorMarginSection,
  computeSectorMarketPosition,
  computeSectorTaxSection,
} from "@/lib/corporations/queries/sectorDetailSections";
import { RUN_REPORT_STAGE_PROJECTION } from "@/lib/corporations/queries/sectorRunReport";
import { computeTechGrowthCostReductionPct, loadSectorTechContext } from "./sectorTechContext";
import { loadSectorDetailContext } from "./sectorDetailContext";
import { buildSectorDetailPlantsTier } from "./sectorDetailPlantsTier";

interface RouteParams {
  params: Promise<{ id: string; sectorId: string }>;
}

/**
 * GET /api/corporations/[id]/sectors/[sectorId]
 * Full sector detail with margin modifier breakdown and market context.
 */
export async function getCorporationSectorDetail(request: Request, { params }: RouteParams) {
  try {
    const { id, sectorId } = await params;
    const db = await getDb();

    // Resolve corporation
    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    // Resolve sector
    if (!ObjectId.isValid(sectorId)) {
      return errorResponse(400, "Invalid sector ID");
    }

    const governorConfig = await db.collection<GameConfig>("gameConfig").findOne(
      { _id: "default" },
      {
        projection: {
          marketGovernorCap: 1,
          marketGovernorRampTurns: 1,
          marketGovernorGlideStartTurn: 1,
          marketGovernorGlideTurns: 1,
          marketGovernorGlideMode: 1,
          marketGovernorGlideFloor: 1,
          explicitPlantCostsEnabled: 1,
          managementOverheadPpPerDoubling: 1,
          strengthUpkeepStage: 1,
          mediaEditorialEnabled: 1,
          mediaOperatingModelsEnabled: 1,
          commandEconomyEnabled: 1,
          privateBankingEnabled: 1,
          bankConstructionFinanceEnabled: 1,
          treasuryCashLedgerEnabled: 1,
          minimumWageLawStage: 1,
          producerMarketLiveFromTurn: 1,
          ...RUN_REPORT_STAGE_PROJECTION,
        },
      }
    );

    const sector = await db.collection<CorporateSector>("corporateSectors").findOne(
      { _id: new ObjectId(sectorId), corporationId: corporation._id },
      {
        projection:
          governorConfig?.explicitPlantCostsEnabled === true
            ? {}
            : { pricingMode: 0, costPlusCostBasis: 0 },
      }
    );

    if (!sector) {
      return errorResponse(404, "Sector not found");
    }
    const editorialStance =
      governorConfig?.mediaEditorialEnabled === true && sector.sectorType === "media"
        ? ((
            await db
              .collection<Corporation>("corporations")
              .findOne({ _id: corporation._id }, { projection: { editorialStance: 1 } })
          )?.editorialStance ?? { economic: 0, social: 0 })
        : undefined;

    // Check if requesting user is CEO
    const user = await getAuthUser().catch(() => null);
    const isCeo = !!user && requireCeo(corporation, user.userId) === null;
    const {
      allTariffs,
      allSectorsRaw,
      corpByIdForLookup,
      activeFtaPairs,
      sectorCountryId,
      federalBudget,
      stateMetrics,
      gameState,
      state,
      siblingCorps,
      siblingsSectors,
      siblingFxByCurrency,
      unownedDoc,
      allStates,
      commodityPrices,
      sectorAmountAnchor,
      politicalBaseModifiers,
      macroEcon,
      totalCorpSectors,
      activeSubsidies,
      allFederalBudgets,
      allSiblingStateBudgets,
      allCorpSectors,
      shouldRedact,
      publicFinancialFog,
      ceo,
      corporationFxRate,
      viewerCorpFxRate,
      sectorHostFxRate,
      sectorHostLiquidCode,
      sectorAmountInCorpCurrency,
      coveringIndustryUnionDoc,
      representingUnionDoc,
      parentDirection,
      viewerCorporation,
    } = await loadSectorDetailContext({
      user,
      request,
      isCeo,
      corporation,
      db,
      sector,
    });

    const blendPresenceKeys = tariffRulesNeedSectorPresenceKeys(allTariffs)
      ? buildSectorPresenceKeys(allSectorsRaw, corpByIdForLookup)
      : new Set<string>();
    const ftaCoverage = buildFtaCoverageLookup(allSectorsRaw, corpByIdForLookup, activeFtaPairs);

    // Extract raw state metric values for display context and modifier computation
    const sectorType = getOperatingSectorType(
      sector.sectorType,
      sector.industryModel,
      sector.mediaDiscriminator
    ) as OperatingSectorType;
    // Ownership margin terms (SOE efficiency, expropriation risk, economic-model
    // fit): the turn applies them inside the stack, so the breakdown names them.
    const ownerCountryId = corporation.countryOwnerId;
    const [economicModelByCountry, ownerBudget] = await Promise.all([
      loadEconomicModelsByCountry(db, [sectorCountryId]),
      ownerCountryId && ownerCountryId !== sectorCountryId
        ? db
            .collection<FederalBudget>("federalBudget")
            .findOne(
              { countryId: ownerCountryId },
              { projection: { stateOwnershipConcentration: 1 } }
            )
        : Promise.resolve(federalBudget),
    ]);
    const ownershipTerms = computeOwnershipMarginTerms({
      corporation,
      sector,
      sectorType,
      corruptionIndex: stateMetrics?.governance?.corruptionIndex?.value ?? null,
      governmentTransparency: stateMetrics?.governance?.governmentTransparency?.value ?? null,
      ownerSoci: ownerBudget?.stateOwnershipConcentration ?? 0,
      investorConfidence: federalBudget?.investorConfidence,
      economicModel: economicModelByCountry.get(sectorCountryId),
    });
    const metrics: StateMetricValues = {
      fullMetrics: stateMetrics ?? null,
      unemploymentRate: stateMetrics?.economic?.unemploymentRate?.value ?? null,
      gridReliability: stateMetrics?.infrastructure?.powerGridReliability?.value ?? null,
      corruptionIndex: stateMetrics?.governance?.corruptionIndex?.value ?? null,
      workforceSkill: stateMetrics?.education?.workforceSkill?.value ?? null,
      crimeRate: stateMetrics?.publicSafety?.crimeRate?.value ?? null,
      broadbandAccess: stateMetrics?.infrastructure?.broadbandAccess?.value ?? null,
      roadCondition: stateMetrics?.infrastructure?.roadCondition?.value ?? null,
      carbonEmissions: stateMetrics?.environment?.carbonEmissions?.value ?? null,
      costOfLiving: stateMetrics?.economic?.costOfLiving?.value ?? null,
    };
    // Note: margin modifiers will be computed after commodity data is available

    // Market position: totals, market share, competitors, unowned pool ,
    // see computeSectorMarketPosition.
    const sectorDetailPreset = resolvePresetIdFromGameState(gameState);
    const sectorDetailUnitScale = getEraUnitScale(sectorDetailPreset);
    const {
      effectiveMarket,
      marketShare,
      competitors,
      attackExposure,
      unownedRevenue,
      unownedPercent,
      siblingRevenueAnchorById,
    } = computeSectorMarketPosition({
      state,
      sector,
      sectorCountryId,
      corporation,
      siblingCorps,
      siblingsSectors,
      siblingFxByCurrency,
      unownedDoc,
      preset: sectorDetailPreset,
    });

    const stateCountryMap = new Map<string, string>(
      allStates.map((s) => [String(s._id), s.countryId])
    );

    // Build global, national, and state balance maps for tariff-aware blending.
    // National totals prefer cp.nationalSupply/nationalDemand so federal demand
    // injected after the state→country rollup (e.g. govt healthcare) is included.
    const globalBalances = new Map<CommodityType, { supply: number; demand: number }>();
    const nationalBalancesByCountry = new Map<
      string,
      Map<CommodityType, { supply: number; demand: number }>
    >();
    const stateBalances = new Map<CommodityType, { supply: number; demand: number }>();
    for (const cp of commodityPrices) {
      globalBalances.set(cp.commodity, {
        supply: cp.globalSupply,
        demand: cp.globalDemand,
      });
      const stateSupply = cp.stateSupply[sector.stateId] ?? 0;
      const stateDemand = cp.stateDemand[sector.stateId] ?? 0;
      stateBalances.set(cp.commodity, {
        supply: stateSupply,
        demand: stateDemand,
      });

      if (!nationalBalancesByCountry.has(sectorCountryId)) {
        nationalBalancesByCountry.set(sectorCountryId, new Map());
      }
      const countryBalances = nationalBalancesByCountry.get(sectorCountryId)!;
      countryBalances.set(
        cp.commodity,
        getNationalCommodityBalance(cp, sectorCountryId, stateCountryMap)
      );
    }

    // Operating strategy: resolve effective supply/demand rates
    const currentTurn = gameState?.currentTurn ?? 0;
    // Tech-tree production-method gating for the strategy picker (inert when off).
    const { techTreesEnabled, techCurrentYear, techCorpView, strategyWorld } =
      await loadSectorTechContext(db, {
        gameState,
        corporation,
        sector,
        lane: sectorType,
        preset: sectorDetailPreset,
      });
    const effectiveRates = getEffectiveStrategyRatesForOperatingModel(
      sectorType,
      sector.strategyId ?? "standard",
      sector.transitionFromStrategyId,
      sector.transitionStartTurn,
      currentTurn,
      sector.industryModel,
      sector.mediaDiscriminator,
      sectorDetailPreset,
      gameState?.hardwareInputReliefStartTurn
    );

    // Extraction-only: resource capacity and per-resource multipliers ,
    // see computeSectorExtractionCapacityContext (no-op for other sectors).
    const {
      stateResources,
      thisSectorMultipliers,
      strategyCapacityMultipliers,
      extractionDesiredByResource,
    } = await computeSectorExtractionCapacityContext(db, sector, sectorType);

    // Signpost (Track 2): when this extraction sector is capacity-bound on one
    // or more resources, point the player at other states where those resources
    // still have room to grow. Binding = this sector's own multiplier is
    // clamped below ~1, unioned with the persisted binding resource. Read-only
    // guidance; no economy change.
    let extractionOpportunities: ResourceOpportunity[] | null = null;
    if (sectorType === "extraction") {
      const bindingResources = new Set<ExtractableResource>();
      for (const [resource, mult] of Object.entries(thisSectorMultipliers)) {
        if (typeof mult === "number" && mult < 0.999) {
          bindingResources.add(resource as ExtractableResource);
        }
      }
      if (sector.capacityBindingResource) {
        bindingResources.add(sector.capacityBindingResource as ExtractableResource);
      }
      if (bindingResources.size > 0) {
        const opportunities = await computeResourceOpportunities(
          db,
          [...bindingResources],
          sector.stateId
        );
        extractionOpportunities = opportunities.length > 0 ? opportunities : null;
      }
    }

    const tariffBlend = getTariffBlendWeights(
      allTariffs,
      sectorCountryId as CountryId,
      sectorType,
      blendPresenceKeys,
      ftaCoverage
    );
    const blendPct = {
      global: Math.round(tariffBlend.globalWeight * 10000) / 100,
      national: Math.round(tariffBlend.nationalWeight * 10000) / 100,
      local: Math.round(tariffBlend.localWeight * 10000) / 100,
    };

    // Commodity rows + market-system sections (supplies/demands, realization,
    // pricing, capital, throughput), see buildSectorCommoditySections.
    const sectorRevenueAnchor = sectorAmountAnchor(sector.revenue);
    const sectorLaborCostAnchor =
      typeof sector.laborCost === "number" ? sectorAmountAnchor(sector.laborCost) : null;

    const {
      effectiveSupply,
      supplies,
      demandsWithShortage,
      priceRealization,
      pricing,
      capital,
      throughput,
    } = await buildSectorCommoditySections({
      currentTurn,
      // What buyers paid per book on the receipt's turn, for the unsold reason.
      // CEO only, and only when there is a fresh receipt to explain. Keyed by
      // the turn engine's own `${worldEpoch}:${turn}` id: the collection also
      // holds a per-epoch share doc and has no `turn` index.
      ...(isCeo
        ? await loadReceiptLanePrices(db, {
            worldEpochId: gameState?.worldEpochId,
            receiptTurn: sector.producerSettlement?.turn,
            currentTurn,
          })
        : {}),
      sector,
      // Commodity flows run in ₳; normalize the sector's host-currency revenue
      // to ₳ at its host rate before passing in.
      sectorRevenueAnchor,
      sectorLaborCostAnchor,
      sectorType,
      sectorCountryId,
      eraUnitScale: sectorDetailUnitScale,
      corporation,
      isCeo,
      commodityPrices,
      globalBalances,
      nationalBalancesByCountry,
      stateBalances,
      tariffBlend,
      effectiveRates,
      stateResources,
      thisSectorMultipliers,
      governorCap: governorConfig?.marketGovernorCap,
    });

    // Dynamic crisis effects must feed the same effective margin used for
    // maintenance and profit, not only the explanatory UI.
    const { crisisMarginPenalty, activeCrises } = await buildSectorCrisisSection(
      db,
      sector,
      sectorCountryId,
      currentTurn
    );

    // Margin modifier stack (commodity blend, tariffs, subsidies, transition,
    // state metrics, regional conditions), see computeSectorMarginSection.
    const { mods, maintenance, profit, enginePnl, transitionProgress, strategyTransitionMod } =
      computeSectorMarginSection({
        sector,
        sectorType,
        sectorCountryId,
        corporation,
        state,
        stateMetrics,
        politicalBaseModifiers,
        gameState,
        metrics,
        macroEcon,
        currentTurn,
        totalCorpSectors,
        marketShare,
        allTariffs,
        activeFtaPairs,
        ftaCoverage,
        activeSubsidies,
        tariffBlend,
        effectiveSupply,
        effectiveRates,
        globalBalances,
        nationalBalancesByCountry,
        stateBalances,
        additionalMarginModifier: crisisMarginPenalty,
      });
    // Labour system (wages on): the persisted sector.laborCost is carved OUT of
    // the gross maintenance figure above (profit-invariant, see computeSectorLaborCost).
    // Surface it as its own line item and display maintenance NET of labour, so the
    // wage cost is visible instead of silently folded into Maintenance.
    const labourWagesEnabled = await isLabourWagesEnabled();
    const sectorLaborCost =
      labourWagesEnabled && typeof sector.laborCost === "number" && sector.laborCost > 0
        ? sector.laborCost
        : 0;
    const maintenanceNet = maintenance - sectorLaborCost;

    // Apportioned per-sector tax, matches the corp page formula (see
    // computeSectorTaxSection for the full derivation).
    const {
      corpLevelCosts,
      thisRevenueShare,
      thisSectorTaxable,
      sectorFederalRate,
      sectorStateRate,
      apportionedFederalTax,
      apportionedStateTax,
    } = computeSectorTaxSection({
      allFederalBudgets,
      allSiblingStateBudgets,
      corporation,
      allCorpSectors,
      sector,
      profit,
      sectorCountryId,
      fxByCurrency: siblingFxByCurrency,
    });

    const r = (v: number | null) => (v != null ? Math.round(v * 10) / 10 : null);

    // ─── Plants tier (marketSystemMode >= "plants") ──────────────────────────
    // Under plants the sector page renders a different set of panels: capacity
    // is the thing the player owns, and revenue is derived from what it makes
    // and sells. Below plants this whole block is `null` and the page is
    // unchanged. One extra read (the host prime rate) and only when plants is on.
    const { plantsEnabled, plants, ownSupplyByCommodity, freightState } =
      await buildSectorDetailPlantsTier({
        shouldRedact,
        publicFinancialFog,
        db,
        isCeo,
        corporation,
        sector,
        allCorpSectors,
        governorConfig,
        currentTurn,
        demandsWithShortage,
        allStates,
        commodityPrices,
        allSectorsRaw,
        siblingFxByCurrency,
        pricing,
        sectorCountryId,
        ceo,
        techTreesEnabled,
        techCorpView,
        sectorType,
        techCurrentYear,
        effectiveSupply,
        stateBalances,
        globalBalances,
        corpByIdForLookup,
        sectorDetailPreset,
        effectiveRates,
        gameState,
        enginePnl,
        corpLevelCosts,
        corporationFxRate,
        strategyWorld,
        stateResources,
        sectorDetailUnitScale,
        profit,
        sectorAmountAnchor,
        marketShare,
        siblingsSectors,
        metrics,
        unownedDoc,
        sectorRevenueAnchor,
        thisRevenueShare,
        sectorFederalRate,
        sectorStateRate,
        maintenanceNet,
        sectorLaborCost,
        mods,
        ownershipTerms,
        crisisMarginPenalty,
        thisSectorMultipliers,
      });

    const marketActionsAvailable =
      !!viewerCorporation &&
      !gameState?.corporationActionsPaused &&
      !(await loadCommandEconomyBlockedCountries(db, [sectorCountryId])).has(sectorCountryId);
    const sectorAttackInfo =
      marketActionsAvailable && viewerCorporation
        ? buildSectorAttackInfo({
            viewerCorporation,
            defenderMarketingStrength: corporation.marketingStrength ?? 0,
            viewerCorpFxRate,
            sectorHostFxRate,
            sectorHostLiquidCode,
            sector,
            sectorType,
            sectorCountryId,
            allTariffs,
            activeFtaPairs,
            unownedRevenue,
            effectiveMarket,
            mods,
            siblingsSectors,
            siblingRevenueAnchorById,
            plantsMode: plantsEnabled,
          })
        : null;
    const forSaleInfo = await buildSectorForSaleInfo(db, {
      sector,
      viewerCorporation,
      isCeo,
      viewerCorpFxRate,
      sellerCurrency: resolveCorpLiquidCurrencyCode(corporation),
      sellerFxRate: corporationFxRate,
    });
    if (forSaleInfo) {
      const outerBlock =
        !user || !viewerCorporation || requireCeo(viewerCorporation, user.userId) !== null
          ? ("not_ceo" as const)
          : gameState?.corporationActionsPaused
            ? ("actions_paused" as const)
            : (await isPrivateEnterpriseBlocked(db, sectorCountryId))
              ? ("state_controlled" as const)
              : null;
      if (outerBlock && !forSaleInfo.blockReason) forSaleInfo.blockReason = outerBlock;
      forSaleInfo.eligible = forSaleInfo.blockReason === null;
    }

    // The same floor the corporation turn applies: admin ratio, else the
    // national minimum wage law in force (minimumWageLawStage).
    const minWageKaitz =
      (
        await resolveMinWageRatioByCountry(
          db,
          [
            {
              countryId: sectorCountryId,
              minimumWageKaitzRatio: federalBudget?.minimumWageKaitzRatio,
            },
          ],
          governorConfig?.minimumWageLawStage
        )
      ).get(sectorCountryId) ?? 0;
    const payload: Record<string, unknown> = {
      sector: {
        _id: sector._id,
        stateId: sector.stateId,
        // Sector's country determines the home currency that Market Position
        // totals render in, a pinned viewer preference would otherwise mask
        // that "total market" is an economy-anchored quantity, not a wallet-
        // anchored one, and make it wobble with forex rate drift each turn.
        countryId: sectorCountryId,
        stateName: state?.name ?? sector.stateId,
        sectorType: sector.sectorType,
        mediaDiscriminator: sector.mediaDiscriminator ?? null,
        mediaAdvertisingCampaignFactor: plannedEconomyMediaSupplyFactor(
          sector.sectorType,
          isPlannedEconomy(
            sectorCountryId,
            gameState?.currentYear,
            governorConfig?.commandEconomyEnabled === true
          ),
          sector.mediaDiscriminator
        ),
        industryModel: sector.industryModel ?? null,
        sectorLabel:
          sector.sectorType === "manufacturing" && sector.industryModel === "vehicles"
            ? "Vehicle manufacturing"
            : OPERATING_SECTOR_TYPE_LABELS[sectorType],
        displayName: sector.displayName ?? null,
        targetGrowthRate: sector.targetGrowthRate ?? 0,
        currentGrowthRate: sector.currentGrowthRate ?? sector.growthRate ?? 0,
        currentGrowthCost: Math.round(sectorAmountInCorpCurrency(sector.currentGrowthCost)),
        revenue: Math.round(sectorAmountInCorpCurrency(sector.revenue)),
        workers: sector.workers ?? calculateWorkers(sectorRevenueAnchor, metrics.workforceSkill),
        workersDesired:
          sector.workersDesired ?? calculateWorkers(sectorRevenueAnchor, metrics.workforceSkill),
        labourStaffingFactor: sector.labourStaffingFactor ?? 1,
        // The state's shared labour pool: workers available against workers
        // every employer there wants. State aggregates are public, so this is
        // not redacted with the sector's own workforce figures.
        stateLabourMarket: buildStateLabourPoolView({
          laborForce: stateMetrics?.economic?.laborForce?.value,
          labourDemand: stateMetrics?.economic?.labourDemand?.value,
          coverageTightness: stateMetrics?.economic?.labourTightness?.value,
          allocatedTightness: employmentStaffingTightness(stateMetrics?.labourEmployment),
          corporateEmployed: stateMetrics?.labourEmployment?.corporateEmployed,
          demandWageIndex: stateMetrics?.economic?.labourDemandWageIndex?.value,
          wagesEnabled: labourWagesEnabled,
          sectorWageLevel: clampWageLevel(sector.wageLevel ?? 1),
        }),
        productionPolicy: sector.productionPolicy ?? 0,
        productionPolicyLevel: sector.productionPolicyLevel ?? 0,
        // Labour system: CEO wage-level lever (1.0 = baseline), the sector's pay
        // level relative to the median sector, and the minimum-wage cost uplift
        // (0 when the Kaitz floor doesn't bind this sector).
        wageLevel: sector.wageLevel ?? 1,
        payVsMedian:
          Math.round(
            (sectorWageLevel(
              getOperatingSectorType(
                sector.sectorType,
                sector.industryModel,
                sector.mediaDiscriminator
              )
            ) /
              MEDIAN_SECTOR_WAGE_LEVEL) *
              100
          ) / 100,
        minWageUplift:
          Math.round((minWageFloorMultiplier(sector.sectorType, minWageKaitz) - 1) * 1000) / 1000,
        // v3 Phase 5/6 (labourSystemMode ≥ "unions"): NPC unionization
        // pressure, 0-100. Feeds unionPremium (labor cost) and the strike
        // trigger threshold.
        unionization: sector.unionization ?? 0,
        // v3 Phase 6: read-only, no dedicated UI panel this phase (backend
        // first, matching Phase 5's precedent).
        workerExpectationIndex: sector.workerExpectationIndex ?? null,
        strikeActive: sector.strikeStartedAtTurn != null,
        // v3 Phase 7a: cooldown state for the union-busting UI panel.
        bustingCooldownUntilTurn: sector.bustingCooldownUntilTurn ?? null,
        // v3 Phase 8: identity of the union covering this country's industry,
        // including a vacant union, plus any demand made by an owned union.
        unionWageDemand: coveringIndustryUnionDoc?.ownerId
          ? (coveringIndustryUnionDoc.demandedWageLevel ?? null)
          : null,
        unionId: coveringIndustryUnionDoc?._id?.toString() ?? null,
        unionName: coveringIndustryUnionDoc?.name ?? null,
        // Union dues v1: who holds THIS sector, as opposed to who organizes the
        // industry. Null means unrepresented, so a drive here is a first claim
        // rather than a raid. A representingUnionId pointing at a union that no
        // longer exists reads as unrepresented rather than as a phantom holder.
        representingUnionId: representingUnionDoc ? sector.representingUnionId?.toString() : null,
        representingUnionName: representingUnionDoc?.name ?? null,
        undergroundUnrest: undergroundUnrestVisible(
          federalBudget?.unionsBanned === true,
          (representingUnionDoc ?? coveringIndustryUnionDoc)?.undergroundStrength
        ),
        createdAt: sector.createdAt,
        // For-sale listing, null when not listed. priceAnchor / npvAnchor are
        // ₳-denominated so the UI formatter routes through the viewer's wallet
        // preference, matching every other anchor-shipped money field.
        forSale: sector.forSale
          ? {
              listedAt: sector.forSale.listedAt,
              foreclosed: sector.forSale.foreclosed,
              pledged: sector.forSale.pledged,
              priceAnchor: sector.forSale.priceAnchor,
              npvAnchor: sector.forSale.npvAnchor,
            }
          : null,
      },
      corporation: {
        _id: corporation._id,
        sequentialId: corporation.sequentialId,
        name: corporation.name,
        brandColor: corporation.brandColor,
        logoUrl: corporation.logoUrl ?? null,
        // Sector money fields (revenue, growthCost, profit, tax approximations)
        // are denominated in the corp's home currency. UI uses this code with
        // formatAmount so wallet preference still governs final rendering.
        liquidCurrencyCode: corporation.liquidCurrencyCode ?? null,
        // State-owned (NatCorp) sectors can't be attacked, the UI hides Market
        // Actions accordingly (backend already rejects the attack)..
        isStateOwned: isStateOwned(corporation),
        // Drives the Prospect modal's success-odds / yield preview (corp-side
        // prospecting math is a pure function of rdScore).
        rdScore: corporation.rdScore ?? 0,
        // The launch command refuses companies whose own type is not
        // extraction, so the sector page only offers Prospect when this is true.
        canProspect: corpCanProspect(corporation),
        ...(governorConfig?.mediaEditorialEnabled === true && sector.sectorType === "media"
          ? { mediaEditorialEnabled: true, editorialStance }
          : {}),
      },
      ceo: ceo
        ? { name: ceo.name, sequentialId: ceo.sequentialId, avatarUrl: ceo.avatarUrl }
        : null,
      pricing,
      capital,
      // Plants tier: null in every world below `marketSystemMode >= "plants"`,
      // which is the flag the page switches its whole layout on.
      plantsEnabled,
      plants,
      commodities: {
        supplies,
        demands: demandsWithShortage.map((d) => {
          const ownSupply = ownSupplyByCommodity.get(d.commodity);
          return ownSupply ? { ...d, ownSupply } : d;
        }),
        ...(freightState ? { freightState } : {}),
        commodityMarginModifier: mods.commodityModifier,
        commoditySupplyDemandBlendPct: blendPct,
        priceRealization,
        throughput,
      },
      margins: {
        base: sector.profitMargin,
        ...mods,
        ...roundOwnershipTerms(ownershipTerms),
        // computeSectorMarginSection already folds crises into both the
        // displayed margin and the maintenance/profit calculation.
        effective: mods.effective,
        crisisMarginPenalty: Math.round(crisisMarginPenalty * 10) / 10,
        activeCrises,
        commoditySupplyDemandBlendPct: blendPct,
        // Raw metric values for display context
        unemploymentRate: r(metrics.unemploymentRate),
        gridReliability: r(metrics.gridReliability),
        corruptionIndex: r(metrics.corruptionIndex),
        workforceSkill: r(metrics.workforceSkill),
        crimeRate: metrics.crimeRate != null ? Math.round(metrics.crimeRate) : null,
        broadbandAccess: r(metrics.broadbandAccess),
        roadCondition: r(metrics.roadCondition),
        carbonEmissions: r(metrics.carbonEmissions),
        costOfLiving: r(metrics.costOfLiving),
        // National-level macroeconomic raw values for display
        inflationRate: r(macroEcon.inflationRate),
        debtToGdpRatio: r(macroEcon.debtToGdpRatio != null ? macroEcon.debtToGdpRatio * 100 : null),
        deficitToGdpPct: r(
          macroEcon.surplusToGdpRatio != null ? -macroEcon.surplusToGdpRatio * 100 : null
        ),
      },
      financials: {
        siteStatement: plants?.pnl.statement
          ? scaleSiteStatement(
              plants.pnl.statement,
              sectorAmountInCorpCurrency(1) / sectorAmountAnchor(1)
            )
          : null,
        revenue: Math.round(sectorAmountInCorpCurrency(sector.revenue)),
        // Realized revenue after every realization leg (capacity, clearing,
        // throughput, capital, strike, embargo). Surfaced so the detail page
        // shows the gap between nameplate and realized income.
        realizedRevenue: Math.round(sectorAmountInCorpCurrency(sectorEconomicRevenue(sector))),
        embargoSuspended: sector.embargoSuspended ?? false,
        // Maintenance shown net of labour; the wage slice is broken out as `laborCost`.
        maintenance: Math.round(sectorAmountInCorpCurrency(maintenanceNet)),
        laborCost: Math.round(sectorAmountInCorpCurrency(sectorLaborCost)),
        growthCost: Math.round(sectorAmountInCorpCurrency(sector.currentGrowthCost)),
        techGrowthCostReductionPct: computeTechGrowthCostReductionPct({
          techTreesEnabled,
          techCurrentYear,
          techCorpView,
          sectorType: sector.sectorType,
          industryModel: sector.industryModel,
          mediaDiscriminator: sector.mediaDiscriminator,
        }),
        profit: Math.round(sectorAmountInCorpCurrency(profit)),
        // Rates displayed to the player are whichever side (domestic/foreign) actually applies
        // to THIS sector based on the corp's HQ country vs the sector's country.
        federalTaxRate: sectorFederalRate,
        stateTaxRate: sectorStateRate,
        // Per-sector apportioned tax: matches corp-page math (revenue-weighted share of
        // corp-level overhead allocated to each sector, remainder taxed at country/state
        // rate). Sibling weighting now uses the same realized-preferring basis
        // (sectorEconomicRevenue) the corp page weights its siblings by, so the two pages
        // no longer disagree over a haircut sibling. Sibling profits still use raw margins
        // here (no state-modifier recomputation), so the total can still differ slightly
        // from the corp-page aggregate for that separate reason.
        federalTaxApprox: Math.round(sectorAmountInCorpCurrency(apportionedFederalTax)),
        stateTaxApprox: Math.round(sectorAmountInCorpCurrency(apportionedStateTax)),
        // This sector's revenue-weighted share of corp-level overhead (marketing +
        // logistics + CEO salary), and the taxable income that remains after it.
        // Surfaced so a zero tax on a profitable-looking sector is self-explanatory:
        // when overhead exceeds operating profit, taxable income is floored at 0.
        corpOverheadShare: Math.round(
          sectorAmountInCorpCurrency(corpLevelCosts * thisRevenueShare)
        ),
        taxableIncome: Math.round(sectorAmountInCorpCurrency(thisSectorTaxable)),
      },
      market: {
        totalMarket: effectiveMarket,
        marketShare,
        competitors,
        // Splits need the plants economy; below it the server refuses every attempt.
        attackExposure: plantsEnabled ? attackExposure : null,
        unownedRevenue: Math.round(unownedRevenue),
        unownedPercent,
      },
      isCeo,
      parentDirection,
      labourEnabled: labourWagesEnabled,
      // Gates the union-busting UI panel; that mechanic requires "full" tier,
      // one above the wage-slider's "wages" tier.
      labourFullEnabled: await isLabourFullMode(),
      // Gates the CEO Prospect action on extraction sectors (per-surface flag
      // convention: the page reads its own GET, no separate flags endpoint).
      prospectingEnabled: await isProspectingEnabled(),
      stateResources: stateResources ?? null,
      // Extraction only, per-resource deposit view for the sector's state:
      // capacity, total desired output across the state's extraction sectors,
      // and headroom (capacity − desired; negative = oversubscribed). null for
      // non-extraction sectors and uncapped states.
      extractionCapacity:
        sectorType === "extraction" && stateResources
          ? buildDepositCapacityRows(stateResources, extractionDesiredByResource)
          : null,
      // Signpost: other states with free capacity for this sector's binding
      // resource(s). null when the sector isn't capacity-bound or nowhere has
      // headroom. Read-only guidance (see computeResourceOpportunities).
      extractionOpportunities,
      attackInfo: sectorAttackInfo
        ? {
            ...sectorAttackInfo,
            canAttack:
              plantsEnabled &&
              viewerCorporation?._id.toString() !== corporation._id.toString() &&
              !corporation.countryOwnerId &&
              !corporation.suspended,
            canSplit: !plantsEnabled,
          }
        : null,
      forSaleInfo,
      strategy: buildSectorStrategySection({
        preset: sectorDetailPreset,
        sector,
        sectorType,
        effectiveRates,
        transitionProgress,
        strategyTransitionMod,
        currentTurn,
        sectorHostLiquidCode,
        sectorHostFxRate,
        commodityPrices,
        techCorpView,
        techCurrentYear,
        techTreesEnabled,
        strategyWorld,
        mediaOperatingModelsEnabled: governorConfig?.mediaOperatingModelsEnabled === true,
        shouldRedact,
        stateResources,
        strategyCapacityMultipliers,
        // Same market state the live sector's own modifier was computed from,
        // so each candidate strategy's projection is directly comparable to it.
        marginProjection: {
          globalBalances,
          nationalBalances: nationalBalancesByCountry.get(sectorCountryId) ?? new Map(),
          stateBalances,
          globalWeight: tariffBlend.globalWeight,
          nationalWeight: tariffBlend.nationalWeight,
          localWeight: tariffBlend.localWeight,
          currentCommodityModifier: mods.commodityModifier,
          currentRealization: priceRealization?.projected ?? null,
        },
      }),
    };

    // Financial visibility banner. When money figures are withheld, the client
    // used to receive bare nulls and render ", " in every stat cell, which reads
    // as "this sector earns $0 / is broken" rather than "you are not allowed to
    // see this". Every hidden-data branch now attaches a reason the UI labels,
    // so a withheld value is never mistaken for a real zero. Admins and the
    // owning CEO fall through with `hidden: false`, they are never fogged (see
    // `isInsider`); this object exists to explain the OTHER cases, not to add a
    // gate.
    payload.financialVisibility = { hidden: false, reason: "visible" };

    // Private corps: redact sensitive financial data but keep attack/split/market
    // info visible so the viewer can still interact with the sector.
    if (shouldRedact) {
      (payload.sector as Record<string, unknown>).revenue = null;
      (payload.sector as Record<string, unknown>).currentGrowthCost = null;
      (payload.sector as Record<string, unknown>).workers = null;
      (payload.sector as Record<string, unknown>).workersDesired = null;
      (payload.sector as Record<string, unknown>).labourStaffingFactor = null;
      payload.corporation = redactPrivateCorporation(
        payload.corporation as Record<string, unknown>
      );
      payload.margins = null;
      payload.financials = null;
      payload.ceo = null;
      payload.financialVisibility = {
        hidden: true,
        reason: user ? "private-corp" : "signed-out",
      };
    } else if (publicFinancialFog) {
      // Public corps still keep identity/CEO/attack-split info visible, only
      // live financial performance is hidden from non-insiders here.
      (payload.sector as Record<string, unknown>).revenue = null;
      (payload.sector as Record<string, unknown>).currentGrowthCost = null;
      (payload.sector as Record<string, unknown>).workers = null;
      (payload.sector as Record<string, unknown>).workersDesired = null;
      (payload.sector as Record<string, unknown>).labourStaffingFactor = null;
      payload.margins = null;
      payload.financials = null;
      payload.financialVisibility = {
        hidden: true,
        reason: user ? "public-rival" : "signed-out",
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}
