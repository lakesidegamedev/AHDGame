/** The plants-tier panels of the sector detail view. */
import type {
  Corporation,
  CorporateSector,
  GameConfig,
  State,
  CommodityPrice,
  Character,
  GameState,
  UnownedSector,
  BankLoan,
  Bond,
} from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import {
  type StateMetricValues,
  TURNS_PER_DAY,
  calculateWorkers,
  managementOverheadPp,
} from "@/lib/constants/corporations";
import { getMarketSystemMode, marketAtLeast } from "@/lib/market/featureFlag";
import { buildSectorPlantsSection } from "@/lib/corporations/queries/sectorDetailSections";
import {
  type OwnSupplyRow,
  explainOwnSupplyReach,
} from "@/lib/corporations/queries/sectorDetailOwnSupply";
import type { SourcingNetworkDoc } from "@/lib/logistics/sourcingLedger";
import {
  buildNationalDominanceShareBySectorId,
  unownedHeadroomUnitsOf,
} from "@/lib/corporations/marketShare";
import { buildMarketContext } from "@/lib/market/marketContext";
import { supportsCostPlusPricing, validCostPlusBasis } from "@/lib/market/costPlusPricing/rules";
import { resolveCountryPrimeRate } from "@/lib/corporations/sectorGrowthCost";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { getSectorTechEffects, getStrategyAvailability } from "@/lib/constants/techTree";
import { upkeptDominanceShield } from "@/lib/corporations/strengthUpkeep";
import { loadReachableBooks, bookFor } from "@/lib/trade/queries/loadReachableBooks";
import { sectorDemandGapUnits } from "@/lib/market/sectorDemandGap";
import { isStateScopedCommodity, commodityDemandGap } from "@/lib/market/commodityMarketScope";
import { latentTopUpForState, latentTopUpForCountry } from "@/lib/market/latentShortageSignal";
import {
  type CommodityType,
  commodityMixWeight,
  COMMODITY_BASE_PRICES,
  eraScaledBasePrices,
} from "@/lib/constants/commodities";
import {
  getOperatingSectorType,
  getEffectiveStrategyRatesForOperatingModel,
  getSectorStrategies,
} from "@/lib/constants/sectorStrategies";
import { productionProductivityMultiplier } from "@/lib/corporations/rules/productionProductivity";
import { deliveredFraction } from "@/lib/corporations/buildDelivery";
import {
  expansionGapAfterExistingCapacity,
  sellableExpansionUnits,
  expansionOperatingReserve,
} from "@/lib/corporations/investment/expansion/rules";
import { runningFlowsPerTurn } from "@/lib/corporations/rules/operatingReserve";
import {
  corpLiquidCapitalToAnchor,
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { computeRetoolHint } from "@/lib/corporations/retoolHint";
import { applyExtractionResourceCapacityToSupply } from "@/lib/corporations/extractionResourceSupply";
import { capacityRescaleRatio } from "@/lib/constants/capacityEconomy";
import {
  loadCommodityDominanceContext,
  commodityTollModels,
} from "@/lib/corporations/commodityDominanceContext";
import { ownSiteDeliveries } from "@/lib/corporations/ownSiteDeliveries";
import {
  matchingSiteReceipt,
  scaleSiteStatement,
  sectorSiteStatement,
} from "@/lib/corporations/rules/siteStatement";
import { sectorEconomicRevenue } from "@/lib/corporations/sectorRevenueBasis";
import { commodityProductionCapacityScale } from "@/lib/banking/capacityAllocation";
import { buildPolicyStackRows } from "@/lib/corporations/plantsPnlBasis";
import { corpToSectorCountrySpread } from "@/lib/currency/sectorFxSpread";
import { withRunReport } from "@/lib/corporations/queries/sectorRunReport";
import { loadInvestmentBondReference } from "@/lib/corporations/investment/bondReference";

/** Builds the plants-tier view: capacity, own supply and freight. Null below plants. */
export async function buildSectorDetailPlantsTier({
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
}: {
  shouldRedact: boolean;
  publicFinancialFog: boolean;
  db: Db;
  isCeo: boolean;
  corporation: Corporation;
  sector: WithId<CorporateSector> | null;
  allCorpSectors: WithId<CorporateSector>[];
  governorConfig: WithId<GameConfig> | null;
  currentTurn: number;
  demandsWithShortage: {
    shortageRatio: number | null;
    inputAvailability?: number | undefined;
    billedUnitPrice: number;
    basePrice: number;
    globalPrice: number;
    nationalPrice: number;
    regionalPrice: number;
    marketPrice: number;
    priceAttribution: CommodityPriceAttribution | undefined;
    commodity:
      | "retail"
      | "energy"
      | "vehicles"
      | "steel"
      | "electronics"
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
      | "network_services";
    label: string;
    icon: string;
    colors: string;
    unit: string;
    units: number;
    rate: number;
    weight: number;
    priceImpact: number;
  }[];
  allStates: WithId<State>[];
  commodityPrices: WithId<CommodityPrice>[];
  allSectorsRaw: WithId<CorporateSector>[];
  siblingFxByCurrency: Map<CurrencyCode, number>;
  pricing:
    | {
        posture: number | null;
        effectivePosture: number | null;
        soldFraction: number | null;
        ownSiteFraction?: number | null;
        clearingFactor: number | null;
        brandPostureNorm?: number | null;
        costPlusEnabled?: boolean;
        costPlusReady?: boolean;
        pricingMode?: "market" | "costPlus";
      }
    | undefined;
  sectorCountryId: CountryId;
  ceo: WithId<Document> | WithId<Character> | null;
  techTreesEnabled: boolean;
  techCorpView: TechCorpView;
  sectorType:
    | "financial"
    | "media"
    | "manufacturing"
    | "chemical_industries"
    | "healthcare"
    | "retail"
    | "technology"
    | "energy"
    | "agriculture"
    | "real_estate"
    | "construction"
    | "defense"
    | "telecommunications"
    | "logistics"
    | "extraction"
    | "manufacturing_vehicles"
    | "media_entertainment";
  techCurrentYear: number;
  effectiveSupply: Partial<
    Record<
      | "retail"
      | "energy"
      | "vehicles"
      | "steel"
      | "electronics"
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
      number
    >
  >;
  stateBalances: Map<
    | "retail"
    | "energy"
    | "vehicles"
    | "steel"
    | "electronics"
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
  globalBalances: Map<
    | "retail"
    | "energy"
    | "vehicles"
    | "steel"
    | "electronics"
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
  corpByIdForLookup: Map<string, WithId<Corporation>>;
  sectorDetailPreset: string;
  effectiveRates: EffectiveStrategyRates;
  gameState: WithId<GameState> | null;
  enginePnl:
    | ({
        costModel?: "legacyResidual" | "explicit";
        plantOverhead?: number;
        revenue: number;
        inventoryRevenue: number;
        inventoryCarry: number;
        source?: "funded";
        stockAddedAtCost?: number;
        transitionSupport?: number;
        internalSupplyIncome?: number;
        internalSupplyCharge?: number;
        inputs: number;
        labour: number;
        upkeep: number;
        compliance: number;
        otherOpex: number;
        otherOpexCreditCapped?: boolean;
        otherOpexUncapped?: number;
        internalSupplyDiscountCost?: number;
        financialLegs: number;
        policyCredit: number;
        policyPp: number;
        operatingCost: number;
        totalCost: number;
        profit: number;
        turn: number;
      } & { policyPp: number })
    | null;
  corpLevelCosts: number;
  corporationFxRate: number;
  strategyWorld: StrategyAvailabilityWorld;
  stateResources:
    | Partial<Record<"iron" | "coal" | "oil" | "rare_earth" | "timber" | "natural_gas", number>>
    | undefined;
  sectorDetailUnitScale: number;
  profit: number;
  sectorAmountAnchor: (amount: number) => number;
  marketShare: number;
  siblingsSectors: WithId<CorporateSector>[];
  metrics: StateMetricValues;
  unownedDoc: WithId<UnownedSector> | null;
  sectorRevenueAnchor: number;
  thisRevenueShare: number;
  sectorFederalRate: number;
  sectorStateRate: number;
  maintenanceNet: number;
  sectorLaborCost: number;
  mods: {
    effective: number;
    unemploymentModifier: number;
    gridReliabilityModifier: number;
    corruptionModifier: number;
    workforceSkillModifier: number | null;
    crimeRateModifier: number | null;
    broadbandModifier: number | null;
    roadConditionModifier: number | null;
    carbonEmissionsModifier: number | null;
    costOfLivingModifier: number | null;
    commodityModifier: number;
    homeLocationModifier: number;
    stateSectorSpecializationModifier: number;
    sectorTypeMatchModifier: number;
    sprawlModifier: number;
    inflationModifier: number;
    debtToGdpModifier: number;
    deficitToGdpModifier: number;
    typeSwitchModifier: number;
    strategyTransitionModifier: number;
    foreignTariffModifier: number;
    domesticTariffMalus: number;
    subsidyModifier: number;
    dominanceMarginPenalty: number;
    dominanceRegulatoryBurdenPp: number;
    sustainedNegativeProductionPenalty: number;
    stateMetricsModifier?: number;
    legacyStateMetricsModifier?: number;
    stateMetricContributions?: StateMetricMarginContribution[];
    regionalConditionsModifier?: number;
    regionalConditionModifiers?: { label: string; marginEffect: number }[];
  };
  ownershipTerms: OwnershipMarginTerms;
  crisisMarginPenalty: number;
  thisSectorMultipliers: Partial<
    Record<"iron" | "coal" | "oil" | "rare_earth" | "timber" | "natural_gas", number>
  >;
}) {
  const marketMode = await getMarketSystemMode();
  const plantsEnabled = marketAtLeast(marketMode, "plants");
  let plants: Awaited<ReturnType<typeof buildSectorPlantsSection>> | null = null;
  let freightState: { observedLoad: number; capacity: number; turn: number | null } | undefined;
  const ownSupplyByCommodity = new Map<string, OwnSupplyRow>();
  if (plantsEnabled && !shouldRedact && !publicFinancialFog) {
    const [latestSourcingNetwork] = await db
      .collection<SourcingNetworkDoc>("sourcingNetworkLoad")
      .find({})
      .sort({ turn: -1 })
      .limit(1)
      .toArray();
    if (isCeo) {
      await explainOwnSupplyReach({
        db,
        corporation,
        sector,
        siblings: allCorpSectors,
        funded:
          typeof governorConfig?.producerMarketLiveFromTurn === "number" &&
          currentTurn >= governorConfig.producerMarketLiveFromTurn,
        shortInputs: demandsWithShortage
          .filter((d) => typeof d.inputAvailability === "number" && d.inputAvailability < 0.999)
          .map((d) => d.commodity),
        stateNameById: new Map(allStates.map((s) => [s._id, s.name ?? s._id])),
        ownRouteDelivered: latestSourcingNetwork?.ownRouteDelivered ?? [],
        ownRouteTurn: latestSourcingNetwork?.turn ?? null,
        currentTurn,
        out: ownSupplyByCommodity,
      });
    }
    const observedFreight = latestSourcingNetwork?.freightTeuByState[sector.stateId];
    const freightPrice = commodityPrices.find((price) => price.commodity === "freight");
    freightState = {
      observedLoad:
        Math.max(0, observedFreight?.bulk ?? 0) + Math.max(0, observedFreight?.special ?? 0),
      capacity: Math.max(0, freightPrice?.stateSupply?.[sector.stateId] ?? 0),
      turn: latestSourcingNetwork?.turn ?? null,
    };
    const nationalMarketShare =
      buildNationalDominanceShareBySectorId({
        sectors: allSectorsRaw,
        stateById: new Map(allStates.map((candidate) => [candidate._id, candidate])),
        unownedSectors: [],
        exchangeRatesByCurrency: siblingFxByCurrency,
      }).get(sector._id.toString()) ?? 0;
    // Same governor bounds the turn processor resolves (turn/corporation
    // index.ts), read from gameConfig, not gameState, so the "market support"
    // pill counts down against the ramp the engine is actually applying.
    const marketCtx = buildMarketContext(marketMode, {
      cap: governorConfig?.marketGovernorCap,
      rampTurns: governorConfig?.marketGovernorRampTurns,
      currentTurn,
      glideStartTurn: governorConfig?.marketGovernorGlideStartTurn,
      glideTurns: governorConfig?.marketGovernorGlideTurns,
      glideMode: governorConfig?.marketGovernorGlideMode,
      glideFloor: governorConfig?.marketGovernorGlideFloor,
    });
    if (
      pricing &&
      governorConfig?.explicitPlantCostsEnabled === true &&
      supportsCostPlusPricing(sector.sectorType)
    ) {
      pricing.costPlusEnabled = true;
      pricing.costPlusReady = validCostPlusBasis(sector.costPlusCostBasis);
      pricing.pricingMode = sector.pricingMode === "costPlus" ? "costPlus" : "market";
    }
    const primeRate = await resolveCountryPrimeRate(db, sectorCountryId);
    const ceoAcumen =
      (ceo as { stats?: { businessAcumen?: number } } | null)?.stats?.businessAcumen ??
      NEUTRAL_STAT;
    const techBuildEffects = techTreesEnabled
      ? getSectorTechEffects(
          techCorpView,
          sectorType,
          sector.industryModel,
          sector.mediaDiscriminator
        )
      : null;
    const techBuildCostMultiplier = techBuildEffects?.growthCostMultiplier ?? 1;
    const techDominanceShield = techBuildEffects
      ? upkeptDominanceShield(
          techCorpView,
          sectorType,
          sector.industryModel,
          sector.mediaDiscriminator,
          techCurrentYear,
          governorConfig?.strengthUpkeepStage
        )
      : 0;
    // The physical input bill: the same demand rows the Inputs panel renders,
    // priced at the BILLED unit price (base x realization factor, the price
    // computeInputsCost actually charges), so the panel and the engine's
    // booked bill cannot disagree. Raw `marketPrice` is context, not the bill.
    const inputsAnchor = demandsWithShortage.reduce(
      (sum, d) => sum + (d.units > 0 ? d.units * (d.billedUnitPrice ?? d.marketPrice) : 0),
      0
    );
    // True buyers' room for THIS sector's outputs, in sector output units.
    // `headroomUnits` (the unowned pool) measures claimable market SHARE,
    // under a clearing glut it reads tens of thousands of "room" while every
    // leg goes unsold (ticket #1027 follow-up: player read it as demand).
    //
    // Scoped to the sector's HOME COUNTRY reachable book, which is the book
    // the clearing engine actually settles this sector against (see
    // market/tradePartition). The world aggregate it used to read counted
    // embargoed and untraded supply the sector can neither buy from nor lose
    // a sale to, so a sector in a real shortage was told it was oversupplied
    // (ticket #1077). Falls back to the aggregate when no book is persisted.
    const reachableBooks = await loadReachableBooks(db, currentTurn);
    const priceDocByCommodity = new Map(commodityPrices.map((cp) => [cp.commodity, cp]));
    const demandGapUnits = sectorDemandGapUnits(effectiveSupply, (gapCommodity) => {
      // Demand audit step 1: restore the 1.5x-cap-hidden demand to the
      // sector gap the player reads. Zero below the cap (quote unchanged).
      const doc = priceDocByCommodity.get(gapCommodity);
      const latentDemandTopUp = doc
        ? isStateScopedCommodity(gapCommodity)
          ? latentTopUpForState(doc, sector.stateId)
          : latentTopUpForCountry(doc, sectorCountryId)
        : 0;
      return commodityDemandGap({
        commodity: gapCommodity,
        stateBalance: stateBalances.get(gapCommodity),
        reachableBook: bookFor(reachableBooks, sectorCountryId, gapCommodity),
        globalBalance: globalBalances.get(gapCommodity),
        latentDemandTopUp,
      });
    });

    // The sizing shortcut uses actual buyers for every output, not the
    // weighted expansion appetite or latent price-cap demand above.
    // Include all output competitors, not just this state/type cell. Reachable
    // goods clear nationally and several sector types can make the same commodity.
    const stateCountry = new Map(
      allStates.map((candidate) => [candidate._id, candidate.countryId])
    );
    const producerOutputMultiplier = (
      candidate: CorporateSector,
      supply: Partial<Record<CommodityType, number>>
    ) => {
      const owner =
        candidate.corporationId.toString() === corporation._id.toString()
          ? corporation
          : corpByIdForLookup.get(candidate.corporationId.toString());
      if (techTreesEnabled && !owner) return NaN;
      const tech =
        techTreesEnabled && owner
          ? getSectorTechEffects(
              owner,
              getOperatingSectorType(
                candidate.sectorType,
                candidate.industryModel,
                candidate.mediaDiscriminator
              ),
              candidate.industryModel,
              candidate.mediaDiscriminator
            ).outputRateMult
          : undefined;
      return productionProductivityMultiplier({
        sectorType: candidate.sectorType,
        supply,
        outputRateMult: tech,
        currentTurn,
        preset: sectorDetailPreset,
      });
    };
    const focalOutputMultiplier = producerOutputMultiplier(sector, effectiveRates.supply);
    const existingProducers = allSectorsRaw.map((candidate) => {
      const supply = getEffectiveStrategyRatesForOperatingModel(
        candidate.sectorType,
        candidate.strategyId ?? "standard",
        candidate.transitionFromStrategyId,
        candidate.transitionStartTurn,
        currentTurn,
        candidate.industryModel,
        candidate.mediaDiscriminator,
        sectorDetailPreset,
        gameState?.hardwareInputReliefStartTurn
      ).supply;
      const multiplier = producerOutputMultiplier(candidate, supply);
      const capacityUnits = candidate.operatingCapacityUnits ?? candidate.capitalStock ?? NaN;
      return {
        stateId: candidate.stateId,
        countryId: stateCountry.get(candidate.stateId) ?? candidate.countryId,
        capacity: capacityUnits * multiplier,
        // A newly founded sector has no plants and has not run a turn yet, so
        // it has no recorded output. With zero capacity it cannot produce
        // anything, so its output is exactly zero rather than unknown.
        produced: candidate.producedUnits ?? (capacityUnits === 0 ? 0 : undefined),
        queued:
          (candidate.buildQueue ?? []).reduce(
            (sum, order) => sum + order.unitsOrdered * (1 - deliveredFraction(order, currentTurn)),
            0
          ) * multiplier,
        supply,
      };
    });
    const currentDemand = Object.entries(effectiveSupply)
      .filter(([, rate]) => (rate ?? 0) > 0)
      .every(([commodity]) => {
        const key = commodity as CommodityType;
        return isStateScopedCommodity(key)
          ? priceDocByCommodity.get(key)?.turn === currentTurn
          : !!bookFor(reachableBooks, sectorCountryId, key);
      });
    const expansionLegs = Object.entries(effectiveSupply)
      .filter(([, rate]) => (rate ?? 0) > 0)
      .map(([commodity]) => {
        const key = commodity as CommodityType;
        const gap = commodityDemandGap({
          commodity: key,
          stateBalance: stateBalances.get(key),
          reachableBook: bookFor(reachableBooks, sectorCountryId, key),
          globalBalance: globalBalances.get(key),
          latentDemandTopUp: 0,
        });
        return {
          weight: commodityMixWeight(effectiveSupply, COMMODITY_BASE_PRICES, key),
          gap: expansionGapAfterExistingCapacity(
            gap,
            existingProducers
              .filter(
                (candidate) =>
                  (candidate.supply?.[key] ?? 0) > 0 &&
                  (isStateScopedCommodity(key)
                    ? candidate.stateId === sector.stateId
                    : candidate.countryId === sectorCountryId)
              )
              .map((candidate) => ({
                capacity: candidate.capacity ?? NaN,
                produced: candidate.produced ?? NaN,
                queued: candidate.queued,
                weight: commodityMixWeight(candidate.supply ?? {}, COMMODITY_BASE_PRICES, key),
              }))
          ),
        };
      });
    const measuredDemandGapUnits =
      currentDemand &&
      Number.isFinite(focalOutputMultiplier) &&
      focalOutputMultiplier > 0 &&
      expansionLegs.every((leg) => leg.gap != null)
        ? Math.max(
            0,
            sellableExpansionUnits(expansionLegs.map((leg) => ({ ...leg, gap: leg.gap! }))) /
              focalOutputMultiplier
          )
        : null;
    // Existing debt needs a repayment budget, which this operating scenario
    // does not model. Do not offer automatic sizing for an indebted company.
    const [activeLoan, activeBond] = await Promise.all([
      db.collection<BankLoan>("bankLoans").findOne(
        {
          borrowerType: "corporation",
          borrowerId: corporation._id,
          status: { $in: ["pending", "current", "arrears", "defaulted"] },
          $or: [{ outstanding: { $gt: 0 } }, { principal: { $gt: 0 } }],
        },
        { projection: { _id: 1 } }
      ),
      db
        .collection<Bond>("bonds")
        .findOne({ corporationId: corporation._id, matured: false }, { projection: { _id: 1 } }),
    ]);
    const unsettled =
      !!activeLoan ||
      !!activeBond ||
      corporation.imfBailoutActive === true ||
      (corporation.shareEscrowBalance ?? 0) < 0 ||
      Object.values(corporation.operatingCashArrearsByCurrency ?? {}).some((value) => value > 0) ||
      Object.values(corporation.federalTaxArrearsAnchorByCountry ?? {}).some((value) => value > 0);
    // What next turn's run costs and earns, for the build warning.
    const runFlows = runningFlowsPerTurn(
      allCorpSectors.flatMap((s) => (s.producerSettlement ? [s.producerSettlement] : [])),
      currentTurn
    );
    const operatingReserveAnchor =
      unsettled || !enginePnl
        ? null
        : expansionOperatingReserve({
            overheadPerTurnAnchor:
              corpLiquidCapitalToAnchor(
                corpLevelCosts + (corporation.rdBudget ?? 0),
                corporation,
                corporationFxRate
              ) / TURNS_PER_DAY,
            sectors: allCorpSectors.map((s) => ({
              current: s.plantsPnl?.turn === currentTurn,
              capacityUnits: s.operatingCapacityUnits ?? s.capitalStock ?? 0,
              queuedUnits: (s.buildQueue ?? []).reduce(
                (sum, order) =>
                  sum + order.unitsOrdered * (1 - deliveredFraction(order, currentTurn)),
                0
              ),
              costPerTurnAnchor:
                readCorpEconomicAnchor(
                  (s.plantsPnl?.totalCost ?? NaN) +
                    Math.max(0, s.plantsPnl?.policyCredit ?? 0) +
                    Math.max(0, s.freightBillingCharge ?? 0),
                  resolveSectorHostCurrencyCode(s, corporation),
                  fxRateForSectorHostFromMap(s, corporation, siblingFxByCurrency)
                ) / TURNS_PER_DAY,
            })),
          });

    // Ticket 1370 follow-up: when the plant is held back because the
    // valuable part of its output is oversupplied, name the strategy whose
    // output this market is short of. Advisory only. Prices and books are the
    // sector's own market, the same ones the throttle and clearing read.
    const marketRatioFor = (commodity: CommodityType): number | null => {
      const doc = priceDocByCommodity.get(commodity);
      if (!doc || !(doc.basePrice > 0)) return null;
      const price = isStateScopedCommodity(commodity)
        ? doc.statePrices?.[sector.stateId]
        : (doc.reachablePrices?.[sectorCountryId] ?? doc.nationalPrices?.[sectorCountryId]);
      const value = typeof price === "number" && price > 0 ? price : doc.globalPrice;
      return typeof value === "number" && value > 0 ? value / doc.basePrice : null;
    };
    const marketBookFor = (commodity: CommodityType) => {
      const doc = priceDocByCommodity.get(commodity);
      if (!doc) return null;
      if (isStateScopedCommodity(commodity)) {
        return {
          supply: doc.stateSupply?.[sector.stateId] ?? 0,
          demand: doc.stateDemand?.[sector.stateId] ?? 0,
        };
      }
      const supply = doc.nationalSupply?.[sectorCountryId];
      const demand = doc.nationalDemand?.[sectorCountryId];
      return typeof supply === "number" && typeof demand === "number"
        ? { supply, demand }
        : { supply: doc.globalSupply, demand: doc.globalDemand };
    };
    const retoolHint = computeRetoolHint({
      currentStrategyId: sector.strategyId ?? "standard",
      currentSupply: effectiveSupply,
      soldByCommodity: sector.soldByCommodity,
      demandThrottleFactor: sector.demandThrottleFactor,
      mothballed: sector.mothballed === true,
      isTransitioning: effectiveRates.isTransitioning,
      producedUnits: sector.producedUnits,
      capacityUnits: sector.operatingCapacityUnits ?? sector.capitalStock,
      strategies: getSectorStrategies(
        sectorType,
        governorConfig?.mediaOperatingModelsEnabled === true,
        sector.mediaDiscriminator,
        sectorDetailPreset
      ),
      isAvailable: (candidate) =>
        !getStrategyAvailability(
          techCorpView,
          candidate,
          techCurrentYear,
          techTreesEnabled,
          strategyWorld
        ).locked,
      supplyFor: (candidate) =>
        applyExtractionResourceCapacityToSupply(
          sectorType,
          candidate.supply,
          stateResources === undefined ? undefined : (stateResources ?? {})
        ),
      rescaleRatio: (toStrategyId) =>
        capacityRescaleRatio(
          sectorType,
          sector.strategyId,
          toStrategyId,
          sector.industryModel,
          sector.mediaDiscriminator
        ),
      priceRatioFor: marketRatioFor,
      balanceFor: marketBookFor,
      basePrices: eraScaledBasePrices(sectorDetailUnitScale),
    });

    const commodityDominanceCtx = await loadCommodityDominanceContext(db, {
      corporation,
      sector,
      turn: currentTurn,
      currentYear: techCurrentYear,
    });

    const ownSite = ownSiteDeliveries(sector.producerSettlement, currentTurn);
    const matchingReceipt = matchingSiteReceipt(sector);
    const statement = scaleSiteStatement(
      sectorSiteStatement(sector, {
        revenue: sectorEconomicRevenue(sector),
        totalCost:
          sectorEconomicRevenue(sector) -
          profit +
          (sector.freightBillingCredit ?? 0) -
          (sector.freightBillingCharge ?? 0),
        freightIncome: sector.freightBillingCredit ?? 0,
        freightCost: sector.freightBillingCharge ?? 0,
        ownSiteValue: ownSite ? (ownSite.valueAnchor * TURNS_PER_DAY) / sectorAmountAnchor(1) : 0,
      }),
      sectorAmountAnchor(1)
    );
    plants = buildSectorPlantsSection({
      bankingCommodityScale: commodityProductionCapacityScale(
        corporation.bankCharter,
        governorConfig?.privateBankingEnabled === true
      ),
      sector,
      sectorType,
      commodityTollModels: commodityDominanceCtx ? commodityTollModels(commodityDominanceCtx) : [],
      currentTurn,
      currentYear: techCurrentYear,
      governorCap: marketCtx.governorCap,
      governorRampTurns: marketCtx.governorRampTurns,
      worldGovernorAnchorTurn: marketCtx.worldGovernorAnchorTurn,
      governorGlideEndTurn: marketCtx.governorGlideEndTurn,
      governorGlide: marketCtx.governorGlide,
      marketSharePercent: marketShare,
      nationalMarketSharePercent: nationalMarketShare,
      // Distinct RIVAL corps in this (state, type) cell. `siblingsSectors` is
      // already scoped to exactly that cell, so this needs no extra read,
      // but it must be distinct CORPS, not sectors, or a rival holding two
      // sectors here would read as two competitors. Same definition as
      // `fetchSectorCompetitorCount`, which the build command charges from.
      competitorCount: new Set(
        siblingsSectors
          .filter((s) => s.corporationId.toString() !== corporation._id.toString())
          .map((s) => s.corporationId.toString())
      ).size,
      primeRate,
      ceoAcumen,
      hostCostOfLivingIndex: metrics.costOfLiving,
      techGrowthCostMultiplier: techBuildCostMultiplier,
      techDominanceShield,
      eraUnitScale: sectorDetailUnitScale,
      preset: sectorDetailPreset,
      corpCapitalAnchor: corpLiquidCapitalToAnchor(
        corporation.liquidCapital,
        corporation,
        corporationFxRate
      ),
      headroomUnits: unownedHeadroomUnitsOf(
        sectorType,
        unownedDoc?.headroomUnits,
        unownedDoc?.revenue ?? 0,
        sectorDetailUnitScale
      ),
      demandGapUnits,
      measuredDemandGapUnits,
      // Every producer's capacity in this cell (the focal sector included),
      // so "Unclaimed share" reads the same pool `headroomUnits` measures.
      retoolHint,
      ownedCellCapacityUnits: siblingsSectors.reduce((sum, s) => {
        const units = s.operatingCapacityUnits ?? s.capitalStock;
        return sum + (typeof units === "number" && Number.isFinite(units) && units > 0 ? units : 0);
      }, 0),
      workers: sector.workers ?? calculateWorkers(sectorRevenueAnchor, metrics.workforceSkill),
      investment: {
        operatingReserveAnchor,
        indebted: unsettled,
        overheadDailyAnchor:
          corpLiquidCapitalToAnchor(
            corpLevelCosts + (corporation.rdBudget ?? 0),
            corporation,
            corporationFxRate
          ) * thisRevenueShare,
        taxRatePercent: sectorFederalRate + sectorStateRate,
        inventoryRevenueDailyAnchor: sectorAmountAnchor(enginePnl?.inventoryRevenue ?? 0),
        freightNetCostDailyAnchor: sectorAmountAnchor(
          (sector.freightBillingCharge ?? 0) - (sector.freightBillingCredit ?? 0)
        ),
      },
      money: {
        statement,
        nameplateRevenueAnchor: sectorAmountAnchor(sector.revenue),
        realizedRevenueAnchor: statement.revenue,
        maintenanceNetAnchor: sectorAmountAnchor(maintenanceNet) + statement.charge,
        labourAnchor: matchingReceipt
          ? (matchingReceipt.labourPaid + (matchingReceipt.labourArrears ?? 0)) * TURNS_PER_DAY
          : sectorAmountAnchor(sectorLaborCost),
        growthCostAnchor: sectorAmountAnchor(sector.currentGrowthCost),
        profitAnchor: statement.profit,
        inputsAnchor: matchingReceipt
          ? matchingReceipt.inputsConsumed * TURNS_PER_DAY
          : inputsAnchor,
        internalSupplyIncomeAnchor: sectorAmountAnchor(sector.plantsPnl?.internalSupplyIncome ?? 0),
        internalSupplyChargeAnchor: sectorAmountAnchor(sector.plantsPnl?.internalSupplyCharge ?? 0),
        freightCostAnchor: sectorAmountAnchor(sector.freightBillingCharge ?? 0),
        freightIncomeAnchor: sectorAmountAnchor(sector.freightBillingCredit ?? 0),
        fundedComplianceAnchor:
          sector.plantsPnl?.source === "funded" &&
          typeof sector.plantsPnl.compliance === "number" &&
          Number.isFinite(sector.plantsPnl.compliance)
            ? sectorAmountAnchor(sector.plantsPnl.compliance)
            : null,
        // Ticket 1122: the turn's own lines, normalized to ₳. Present on any
        // sector that has run a plants turn since the field shipped; the
        // builder falls back to reconstruction when it is null.
        enginePnl: enginePnl
          ? {
              revenue: sectorAmountAnchor(enginePnl.revenue),
              inputs: sectorAmountAnchor(enginePnl.inputs),
              labour: sectorAmountAnchor(enginePnl.labour),
              upkeep: sectorAmountAnchor(enginePnl.upkeep),
              compliance: sectorAmountAnchor(enginePnl.compliance),
              otherOpex: sectorAmountAnchor(enginePnl.otherOpex),
              financialLegs: sectorAmountAnchor(enginePnl.financialLegs),
              internalSupplyDiscountAnchor: sectorAmountAnchor(
                enginePnl.internalSupplyDiscountCost ?? 0
              ),
              inventoryCarry: sectorAmountAnchor(enginePnl.inventoryCarry ?? 0),
              policyCredit: sectorAmountAnchor(enginePnl.policyCredit),
              policyPp: enginePnl.policyPp,
              operatingCost: sectorAmountAnchor(enginePnl.operatingCost),
              totalCost: sectorAmountAnchor(enginePnl.totalCost),
              profit: sectorAmountAnchor(enginePnl.profit),
            }
          : null,
      },
      // The modifier stack behind that credit, already in money and summing
      // to it exactly, so the panel can show WHY the profit is what it is
      // rather than one opaque line. Same rows the corporation page's margin
      // drilldown lists, minus commodity pressure, which the physical model
      // prices directly as the input bill and the sale price.
      policyStack: enginePnl
        ? buildPolicyStackRows({
            policyCreditAnchor: sectorAmountAnchor(enginePnl.policyCredit),
            revenueAnchor: sectorAmountAnchor(enginePnl.revenue),
            mods: {
              ...mods,
              ...ownershipTerms,
              // The overhead the turn applied (group basis when on, SOEs
              // exempt); before the first turn writes it, the corp's own
              // plant count.
              managementOverheadModifier: -(
                corporation.managementOverheadPp ??
                managementOverheadPp(
                  allSectorsRaw.reduce(
                    (sum, s) =>
                      s.corporationId.equals(corporation._id) && Number.isFinite(s.plantCount)
                        ? sum + (s.plantCount as number)
                        : sum,
                    0
                  ),
                  governorConfig?.managementOverheadPpPerDoubling ?? 0
                )
              ),
            },
            appliedPolicyPp: enginePnl.policyPp,
          })
        : [],
      regulatoryBurdenPp: mods.dominanceRegulatoryBurdenPp ?? 0,
      crisisMarginPenaltyPp: crisisMarginPenalty,
      autopilotEnabled: corporation.autopilot != null,
      // C9: the same spread `buildCapacity` charges on top of the build cost.
      // Priced off 1 ₳ so the result is the RATE, which is all the quote needs
      // (the spread is strictly proportional to the construction cost).
      fxSpreadRate: corpToSectorCountrySpread(corporation, sectorCountryId, 1).spreadAnchor,
      depositBound:
        sectorType === "extraction" &&
        Object.values(thisSectorMultipliers).some((m) => typeof m === "number" && m < 0.999),
    });
    plants.buildQuote.runningBillsAnchor = runFlows.bills;
    plants.buildQuote.runRevenueAnchor = runFlows.revenue;
    withRunReport(plants, sector.producerSettlement, currentTurn, governorConfig);
  }

  if (
    plants &&
    isCeo &&
    governorConfig?.privateBankingEnabled === true &&
    governorConfig.bankConstructionFinanceEnabled === true &&
    governorConfig.treasuryCashLedgerEnabled === true &&
    Number.isFinite(corporationFxRate) &&
    corporationFxRate > 0
  ) {
    const currency = resolveCorpLiquidCurrencyCode(corporation);
    if (currency)
      plants.buildQuote.financing = {
        corporationId: String(corporation._id),
        currency,
        localPerAnchor: corporationFxRate,
        ...(sector.constructionFinancing?.status === "awaiting_approval" ||
        sector.constructionFinancing?.status === "funding"
          ? {
              pendingRequest: {
                claimId: sector.constructionFinancing.claimId,
                status: sector.constructionFinancing.status,
              },
            }
          : {}),
      };
  }

  if (plants?.investment) {
    plants.investment.bondReference = await loadInvestmentBondReference(
      db,
      resolveCorpLiquidCurrencyCode(corporation),
      currentTurn
    );
  }
  return { plantsEnabled, plants, ownSupplyByCommodity, freightState };
}
