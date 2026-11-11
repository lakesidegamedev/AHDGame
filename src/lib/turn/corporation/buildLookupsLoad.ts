/** The batched reads behind the corporation turn lookups. */
import type { Db } from "mongodb";
import type {
  CorporateSector,
  CommodityPrice,
  CentralBank,
  StateBudget,
  Tariff,
  State,
  ExchangeRate,
  StateResourceCapacity,
  UnownedSector,
} from "@/lib/db/types";
import { SETTLEMENT_HISTORY_EXCLUDED } from "@/lib/banking/settlementHistory";
import { findMergedRegionMetricsMany } from "@/lib/macroMetrics/merge";
import { getActiveSubsidies } from "@/lib/subsidies/subsidyEffects";
import { loadActiveFtaPairs } from "@/lib/tariffs/ftaOverrides";
import type { TradeFlowSnapshot } from "@/lib/db/types/tradeFlowSnapshot";
import type { OrganizationMembership } from "@/lib/db/types/internationalOrganization";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";
import { loadWorldPreset } from "@/lib/currency/gdpAnchorRate";
import {
  type ManufacturingProductProject,
  MANUFACTURING_PRODUCT_PROJECTS_V2,
} from "@/lib/products/manufacturingProject";
import { activeManufacturingProductProjectProjection } from "@/lib/products/manufacturingProjectPersistence";
import { type MediaProductProject, MEDIA_PRODUCT_PROJECTS } from "@/lib/products/mediaProduct";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { statesCollection } from "@/lib/db/repositories/states";

/** Issues the parallel reads the lookups are built from. */
export async function loadCorporationLookupInputs({
  db,
  options,
  embargoTurn,
}: {
  db: Db;
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
  embargoTurn: number;
}) {
  const [
    loadedCorporations,
    loadedSectors,
    allStateMetrics,
    commodityPrices,
    centralBanks,
    activeBonds,
    federalBudgets,
    stateBudgets,
    allTariffs,
    activeSubsidies,
    states,
    exchangeRateDocs,
    stateResourceCapacityDocs,
    activeFtaPairs,
    unownedSectorDocs,
    latestTradeSnapshot,
    orgMembershipDocs,
    activeEmbargoDocs,
    worldPreset,
    activeManufacturingProjects,
    activeMediaProductProjects,
  ] = await Promise.all([
    corporationsCollection(db)
      .find(
        {},
        {
          projection: {
            // Money-move settlement history: most of each document's bytes,
            // read only by the settlement protocol under its own projection.
            ...SETTLEMENT_HISTORY_EXCLUDED,
            // Per-order political advertising receipts: written by the money
            // move that pays the seller, then never read back (the guard is
            // the move key). Two kilobytes of pure write-only history on every
            // corporation, decoded by every turn read.
            politicalMediaReceipts: 0,
            groupSupplyBasis: 0,
            ...(options?.mediaEditorialEnabled === true ? {} : { editorialStance: 0 }),
            ...(options?.productLinesV2Enabled === true
              ? {}
              : {
                  manufacturingProductAdvertisingObligationsV2: 0,
                  manufacturingProductAdvertisingReceiptV2: 0,
                  manufacturingProductDevelopmentReceiptV2: 0,
                  manufacturingProductDevelopmentPaidTurnV2: 0,
                }),
            ...(options?.mediaProductSlatesEnabled === true
              ? {}
              : {
                  mediaProductDevelopmentReceiptV1: 0,
                  mediaProductAdvertisingReceiptV1: 0,
                  mediaProductAdvertisingObligationsV1: 0,
                }),
          },
        }
      )
      .toArray(),
    // `plantsPnl` is ~15% of the collection. corporationTurn writes it via
    // sectorTurn as a complete overwrite and never reads the prior value.
    // `soldByCommodity` IS read: the demand throttle values last turn's sales
    // leg by leg, so it must not be projected out.
    // `constructionFinancing` and `constructionPropertyTransition` are the
    // construction-lending claim on the sector: no turn module reads either
    // field (the banking commands do, under their own projections), so the
    // whole turn pays to decode them for nothing. Nothing writes a sector back
    // as a whole document either: sectorTurn emits targeted $set/$inc/$pull/
    // $push ops, so an excluded field cannot be blanked by a write-back.
    db
      .collection<CorporateSector>("corporateSectors")
      .find(
        {},
        {
          projection: {
            plantsPnl: 0,
            constructionFinancing: 0,
            constructionPropertyTransition: 0,
            ...(options?.explicitPlantCostsEnabled === true
              ? {}
              : { pricingMode: 0, costPlusCostBasis: 0 }),
            ...(options?.omitBuildQueue ? { buildQueue: 0 } : {}),
            ...(options?.productLinesV2Enabled
              ? {}
              : {
                  outputUnitsByCommodity: 0,
                  outputAnchorByCommodity: 0,
                  productQualityByCommodity: 0,
                  productOutputCapacityUnits: 0,
                }),
          },
        }
      )
      .toArray(),
    // Legacy-shaped view so the headline maps, condition modifiers, and the
    // margin engine's stored-value reads keep their single-doc shape.
    findMergedRegionMetricsMany(db, {}),
    // Projected to the fields actually read by this file (and the
    // buildNationalCommodityBalances helper it feeds). commodityPrices
    // documents carry per-state supply/demand maps which can be large; the
    // unread fields (history, metadata, etc.) compound per turn.
    db
      .collection<CommodityPrice>("commodityPrices")
      .find(
        {},
        {
          projection: {
            _id: 1,
            commodity: 1,
            turn: 1,
            globalSupply: 1,
            globalDemand: 1,
            globalPrice: 1,
            basePrice: 1,
            statePrices: 1,
            stateSupply: 1,
            stateDemand: 1,
            stateInputAvailability: 1,
            statePlacedSupply: 1,
            stateDeliveryLimitedSupply: 1,
            stateOwnerDeliveryLimited: 1,
            nationalSupply: 1,
            nationalDemand: 1,
            reachablePrices: 1,
            demandTruncatedUnits: 1,
          },
        }
      )
      .toArray() as Promise<CommodityPrice[]>,
    // Only countryId + primeRate read here; the doc is NOT returned from
    // buildCorporationLookups so downstream consumers are unaffected.
    centralBanksCollection(db)
      .find({}, { projection: { countryId: 1, primeRate: 1, primeRateSmoothed: 1 } })
      .toArray() as Promise<CentralBank[]>,
    // All active bonds — sovereigns included. Issuer-side filtering (corporate-only)
    // happens in the bondsByCorpId loop below; holder-side keeps everything so
    // sovereign bonds held by corps contribute to portfolio anchor / share price.
    bondsCollection(db).find({ matured: false }).toArray(),
    federalBudgetCollection(db)
      .find(
        {},
        {
          projection: {
            countryId: 1,
            "economicFactors.inflationRate": 1,
            debtToGdpRatio: 1,
            surplus: 1,
            gdp: 1,
            "taxRates.domesticCorporateTax": 1,
            "taxRates.foreignCorporateTax": 1,
            // Pass-through owners are taxed at the top personal rate.
            "taxRates.incomeTaxHigh": 1,
            "taxRates.incomeTax": 1,
            // Per-country authored GDP-share targets: updateCorporateTaxBases reads
            // taxBaseGdpShareBaseline.{domestic,foreign}CorporateProfits as the
            // per-country floor share instead of the universal
            // GDP_DOMESTIC/FOREIGN_CORPORATE_FACTOR constants. Must be
            // projected here or it silently reads undefined for every budget.
            taxBaseGdpShareBaseline: 1,
            // Labour system (v1 minimum wage, v3 Phase 7b union-law bias) —
            // both read via lookups.federalBudgets in turn/corporation/index.ts
            // (buildMinWageRatioByCountry / buildUnionLawBiasByCountry). Must
            // be projected here or those builders silently see every budget
            // as absent/neutral.
            minimumWageKaitzRatio: 1,
            unionLawBias: 1,
            unionsBanned: 1,
            // Producer market shadow: public buyers are funded from the budget
            // outlay by category, converted from the budget's own currency.
            currencyCode: 1,
            "spending.byCategory": 1,
            ...(options?.politicalMediaMarketEnabled === true
              ? {
                  treasuryCashLocal: 1,
                  treasuryBalance: 1,
                }
              : {}),
          },
        }
      )
      .toArray(),
    db
      .collection<StateBudget>("stateBudgets")
      .find(
        {},
        {
          projection: {
            _id: 1,
            "taxRates.domesticCorporateTax": 1,
            "taxRates.foreignCorporateTax": 1,
            "taxRates.incomeTaxHigh": 1,
            "taxRates.incomeTax": 1,
          },
        }
      )
      .toArray(),
    db.collection<Tariff>("tariffs").find({}).toArray(),
    getActiveSubsidies(db),
    statesCollection(db)
      .find(
        {},
        {
          projection: {
            _id: 1,
            countryId: 1,
            gdp: 1,
            sectorSpecializations: 1,
            ...(options?.mediaEditorialEnabled === true
              ? { cachedEconomicLean: 1, cachedSocialLean: 1 }
              : {}),
          },
        }
      )
      .toArray(),
    // Only currencyCode + rate read; consumed only as exchangeRatesByCurrency map.
    db
      .collection<ExchangeRate>("exchangeRates")
      .find({}, { projection: { currencyCode: 1, rate: 1 } })
      .toArray() as Promise<ExchangeRate[]>,
    db
      .collection<StateResourceCapacity>("stateResourceCapacity")
      .find({}, { projection: { stateId: 1, resources: 1 } })
      .toArray(),
    loadActiveFtaPairs(db),
    db.collection<UnownedSector>("unownedSectors").find({}).toArray(),
    // Latest trade-flow snapshot (prev turn) → per-country export intensity for
    // the export-reward margin premium. One small doc.
    db
      .collection<TradeFlowSnapshot>("tradeFlowSnapshots")
      .find({}, { sort: { turn: -1 }, limit: 1 })
      .toArray(),
    // Trade-graph inputs for the market partition (era worlds): shared org
    // blocs and ALL active embargoes (the suppression query above keeps only
    // comprehensive ones; the affinity graph needs every block/cap lane).
    db
      .collection<OrganizationMembership>("organizationMemberships")
      .find({}, { projection: { countryId: 1, organizationId: 1 } })
      .toArray(),
    db
      .collection<TradeEmbargo>("tradeEmbargoes")
      .find({
        $or: [{ expiresTurn: { $exists: false } }, { expiresTurn: { $gte: embargoTurn } }],
      })
      .toArray(),
    loadWorldPreset(db),
    options?.productLinesV2Enabled === true
      ? db
          .collection<ManufacturingProductProject>(MANUFACTURING_PRODUCT_PROJECTS_V2)
          .find(
            { activeCorporationId: { $exists: true } },
            { projection: activeManufacturingProductProjectProjection() }
          )
          .toArray()
      : Promise.resolve([] as ManufacturingProductProject[]),
    options?.mediaProductSlatesEnabled === true
      ? db
          .collection<MediaProductProject>(MEDIA_PRODUCT_PROJECTS)
          .find({ stage: { $in: ["development", "launch", "growth", "mature", "decline"] } })
          .project<MediaProductProject>({
            _id: 1,
            corporationId: 1,
            activeDevelopmentCorporationId: 1,
            sectorId: 1,
            operatingSectorType: 1,
            kindId: 1,
            title: 1,
            allocationShare: 1,
            stage: 1,
            startedTurn: 1,
            stageStartedTurn: 1,
            lastProcessedTurn: 1,
            developmentPaidAnchor: 1,
            paidThresholdAnchor: 1,
            elapsedDevelopmentTurns: 1,
            elapsedThresholdTurns: 1,
            developmentAdvertisingAnchor: 1,
            developmentAdvertisingTurns: 1,
            launchQuality: 1,
            qualityBonus: 1,
            productBrand: 1,
          })
          .toArray()
      : Promise.resolve([] as MediaProductProject[]),
  ]);
  return {
    loadedCorporations,
    loadedSectors,
    activeManufacturingProjects,
    activeMediaProductProjects,
    states,
    activeBonds,
    exchangeRateDocs,
    worldPreset,
    centralBanks,
    federalBudgets,
    allStateMetrics,
    stateBudgets,
    commodityPrices,
    latestTradeSnapshot,
    activeEmbargoDocs,
    orgMembershipDocs,
    activeFtaPairs,
    allTariffs,
    unownedSectorDocs,
    stateResourceCapacityDocs,
    activeSubsidies,
  };
}
