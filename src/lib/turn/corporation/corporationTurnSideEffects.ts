/** Post-market side effects of the corporation turn: shadow phase, media, ventures, contracts, FX spreads and strike pulses. */
import { runFundedProducerTurn } from "./fundedProducerTurn";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import type { GameState } from "@/lib/db/types";
import type { CorporationTurnOptions } from "./corporationTurnOptions";
import { type AnyBulkWriteOperation, ObjectId } from "mongodb";
import type { LabourContext } from "@/lib/labour/laborCost";
import type { ActionAuditInput } from "@/lib/db/types/actionAuditLog";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { PoliticalMediaOrderForClearing } from "@/lib/politicalMedia/journal";
import { type CommodityType, eraScaledBasePrices } from "@/lib/constants/commodities";
import { drainDeferredTurnWork, deferAfterTurn } from "@/lib/turn/deferredTurnWork";
import { runProducerMarketShadowPhase, shadowFitsPhaseBudget } from "./producerMarketShadowPhase";
import { PHASE_TIMEOUT_MS } from "@/lib/turn/processingLock";
import { processNppCorporationDecisions } from "@/lib/turn/nppCorporationBehavior";
import { corporationsWithReservedTaxCash } from "./corporateDecisionCash";
import { persistNppManufacturingProjects } from "./persistManufacturingProjects";
import { groupForecastWriteOps } from "./groupSupplyTurn";
import { deleteDivestedNppSectors } from "../npp/divestmentPersistence";
import { persistLabourIndices, persistLabourDemand } from "./corporationTurnPhases";
import { partitionedBulkWrite } from "./partitionedBulkWrite";
import { applyOperatingCashThenDevelopmentCash } from "./manufacturingDevelopmentCashSettlement";
import { applyCorporationCashWrites } from "@/lib/turn/npp/foundingCashLedger";
import { startNppVentures } from "@/lib/products/venture/nppStart";
import { getNppCashFloorAnchor } from "@/lib/turn/npp/nppCashReserve";
import { processProductVentures } from "@/lib/products/venture/turn";
import { attemptNppConstructionFinance } from "./nppConstructionFinanceAttempts";
import {
  flushNppTechUnlockLedger,
  buildTechUnlockFlushAudit,
} from "@/lib/corporations/techTree/techUnlockLedger";
import { creditEquityPoolsBatch } from "@/lib/equities/marketPool";
import type { CoverageSectorInput } from "@/lib/advertising/rules/coverage";
import { processAdvertisingTurn } from "@/lib/advertising/settlementTurn";
import { settlePoliticalMediaOrdersTurn } from "./politicalMediaSettlement";
import {
  type PaidPoliticalMediaSellerAmount,
  attributeMediaProductSales,
  reconcileMediaProductDelivery,
} from "@/lib/products/rules/mediaProductSales";
import {
  type SettledPoliticalAttentionOrder,
  addSettledPoliticalAttention,
} from "@/lib/mediaOperatingModels/reach";
import { persistMediaProductSales } from "@/lib/products/mediaProductSales";
import { applyMediaEditorialEffects } from "@/lib/mediaEditorial/applyEffects";
import { processNppSupplyAgreements } from "@/lib/turn/npp/nppSupplyAgreements";
import { processNppProspecting } from "@/lib/turn/npp/nppProspecting";
import { processNppCorpTreasury } from "@/lib/turn/npp/nppCorpTreasury";
import { distributeConversionSpreadsBatch } from "@/lib/currency/marketMaker";
import {
  fireStrikeStartedPulse,
  fireStrikeResolvedPulse,
} from "@/lib/corporations/sentimentEvents";

/** Runs the side effects that follow sector processing and the bulk writes; returns the NPP sectors founded this turn. */
export async function runCorporationTurnSideEffects({
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
  techTreesEnabled,
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
}: {
  db: Db;
  funded: Awaited<ReturnType<typeof runFundedProducerTurn>> | undefined;
  marketGovernorConfig: WithId<GameConfig> | null;
  phaseStartedAt: number;
  turn: number | undefined;
  gameState: GameState | null;
  lookups: CorporationLookups;
  sectorTurnEnv: SectorTurnEnv;
  sectorOps: SectorUpdateOp[];
  now: Date;
  techTreesEnabled: boolean;
  groupMembership:
    | (GroupMembership & {
        parentControlByCorpId: Map<string, { corporationId: string; votingPercent: number }>;
      })
    | undefined;
  corpSnapshots: CorpSnapshot[];
  treasuryCashLedgerEnabled: boolean;
  options: CorporationTurnOptions;
  mark: (label: string) => void;
  corpOps: AnyBulkWriteOperation<Corporation>[];
  market: MarketContext;
  brandLoyaltyUpdates: CorpLoyaltyUpdate[];
  qualityCorpUpdates: Map<string, number>;
  labour: LabourContext;
  labourWageIndexByState: Map<string, number>;
  automationIndexByState: Map<string, number>;
  labourDemandByState: Map<string, number>;
  labourDemandWageIndexByState: Map<string, number>;
  automationDisplacedByState: Map<string, number> | undefined;
  manufacturingDevelopmentCashOps: AnyBulkWriteOperation<Corporation>[];
  mediaProductSlatesEnabled: boolean;
  productVentureDomainsEnabled: Record<VentureDomain, boolean>;
  plantsEnabledForMarketShare: boolean;
  corpAuditEntries: ActionAuditInput[];
  equityPoolDividendAccruals: {
    corporationId: ObjectId;
    currency: CurrencyCode;
    amountLocal: number;
  }[];
  mediaOperatingModelsEnabled: boolean;
  currentYear: number | undefined;
  advertisingDeliveredAnchorBySellerId: Map<string, number>;
  settledMarketingSpendAnchorByBuyerId: Map<string, number>;
  politicalMediaMarketEnabled: boolean;
  politicalMediaOrders: PoliticalMediaOrderForClearing[];
  plannedPoliticalMediaOrders: Map<string, PoliticalMediaSettlementPlan>;
  mediaEditorialEnabled: boolean;
  newCommodityQuality: Map<CommodityType, number> | null;
  sectorFxSpreadFees: { fromCurrency: CurrencyCode; toCurrency: CurrencyCode; fee: number }[];
  strikeEvents: {
    sectorId: string;
    sectorType: string;
    countryId: string;
    event:
      | "started"
      | "resolved_concession"
      | "resolved_waitout"
      | "resolved_banned"
      | "resolved_agreement";
  }[];
}) {
  await drainDeferredTurnWork();
  await runProducerMarketShadowPhase(db, {
    // Never measure a shadow beside the live funded market in the same turn.
    // The shadow is telemetry inside this phase's timeout. Skip it when the
    // phase has already used most of its budget; a skipped turn only starts a
    // new shadow run next turn, a timed-out phase fails the economy.
    enabled:
      !funded &&
      marketGovernorConfig?.producerMarketShadowEnabled === true &&
      shadowFitsPhaseBudget(Date.now() - phaseStartedAt, PHASE_TIMEOUT_MS),
    turn: turn ?? gameState?.currentTurn ?? 0,
    worldEpoch: gameState?.worldEpochId,
    lookups,
    env: sectorTurnEnv,
    sectorOps,
    // Telemetry only: the market run, close and evidence finish after the turn.
    defer: deferAfterTurn,
  });

  // Phase 2b: NPP corporation AI decisions, budgets, expansion, dividends
  // Run before bulk writes so NPP decisions are applied this turn.
  const {
    corpUpdates: nppCorpUpdates,
    sectorUpdates: nppSectorUpdates,
    newSectors: nppNewSectors,
    divestedSectorIds: nppDivestedSectorIds,
    techLedger: nppTechLedger,
    foundingCashWitnesses = [],
    reinvestmentCashWitnesses = [],
    manufacturingProductProjects: nppManufacturingProductProjects,
    constructionFinanceRequests: nppConstructionFinanceRequests,
    constructionFinanceCandidateCount: nppConstructionFinanceCandidateCount,
    constructionFinanceBacklogCount: nppConstructionFinanceBacklogCount,
  } = await processNppCorporationDecisions(db, turn ?? 0, now, techTreesEnabled, {
    groupMembership,
    corporations: corporationsWithReservedTaxCash(
      lookups.corporations,
      corpSnapshots,
      lookups.exchangeRatesByCurrency,
      treasuryCashLedgerEnabled
    ),
    issuerBondsByCorpId: lookups.bondsByCorpId,
    heldBondsByCorpId: lookups.bondsHeldByCorpId,
    ...(options.batchNppMarketEntryCredit ? { batchRelocationCredit: true } : {}),
  });
  mark("nppCorpDecisions");

  await persistNppManufacturingProjects(db, nppManufacturingProductProjects);

  corpOps.push(...groupForecastWriteOps(market, lookups));
  for (const snapshot of corpSnapshots) {
    const distribution = funded?.deferredDistributions?.get(snapshot.corpId.toHexString());
    if (distribution) snapshot.deferredProducerDistributions = distribution;
    if (distribution && (marketGovernorConfig?.nppDividendAfterTaxStage ?? 0) >= 1)
      snapshot.distributionAfterTax = true;
  }
  // Merge NPP corp updates into the main corpOps
  for (const nppUpdate of nppCorpUpdates) {
    corpOps.push({
      updateOne: {
        filter: nppUpdate.filter,
        update: nppUpdate.update,
      },
    });
  }

  // Merge brand-loyalty updates (A2). Separate $set ops keyed by corp _id, they
  // only touch brandLoyalty/brandPostureNorm, so they compose with the main
  // corp $set for the same doc (Mongo merges multiple bulk ops per document).
  for (const lu of brandLoyaltyUpdates) {
    corpOps.push({
      updateOne: {
        filter: { _id: new ObjectId(lu.corpId) },
        update: {
          $set: {
            brandLoyalty: Math.round(lu.loyalty * 100) / 100,
            brandPostureNorm: Math.round(lu.postureNorm * 10000) / 10000,
          },
        },
      },
    });
  }

  // Merge quality updates (averageQuality per corp).
  for (const [corpId, q] of qualityCorpUpdates) {
    corpOps.push({
      updateOne: {
        filter: { _id: new ObjectId(corpId) },
        update: { $set: { averageQuality: q } },
      },
    });
  }

  // Merge NPP sector growth-rate updates into sectorOps
  for (const nppSectorUpdate of nppSectorUpdates) {
    sectorOps.push({
      updateOne: {
        filter: nppSectorUpdate.filter,
        update: nppSectorUpdate.update,
      },
    });
  }

  // Divest losing NPP sectors, remove from corporateSectors
  await deleteDivestedNppSectors(db, nppDivestedSectorIds);

  // v2: persist the per-state labour wage index (+ v2-3b: automation index) to
  // stateMetrics, see persistLabourIndices for the prior-value delta capture.
  // Only written when the labour system is on, so it's inert otherwise.
  await persistLabourIndices({
    db,
    wagesEnabled: labour.wagesEnabled,
    labourWageIndexByState,
    automationIndexByState,
  });

  // Record current-turn corporate labour demand for every region. The metric
  // engine combines it with this turn's labour force after computing supply.
  // Deliberately not gated on the labour system being on.
  await persistLabourDemand({
    db,
    labourDemandByState,
    labourDemandWageIndexByState,
    automationDisplacedByState,
    turn,
  });

  // Phase 3: Bulk write sector and corp updates
  if (sectorOps.length > 0) {
    // bulkWrite op array type doesn't satisfy AnyBulkWriteOperation narrowing, runtime shape is valid.
    // Every op is keyed by its sector `_id`; ops on one sector (the flip-turn
    // `$push` after the main update) stay together and in order.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await partitionedBulkWrite(db.collection("corporateSectors"), sectorOps as any[]);
  }
  // After the sector writes, which carry each sector's own stamp: a sector
  // founded before the next run catches its builds up from this turn (#5169).
  if (typeof turn === "number") {
    await db
      .collection<GameState>("gameState")
      .updateOne({ _id: "current" }, { $set: { buildDeliverySettledTurn: turn } });
  }
  mark("sectorBulkWrite");
  if (corpOps.length > 0 || manufacturingDevelopmentCashOps.length > 0) {
    // Product development is capitalized separately, after operating P&L. The
    // explicit sequence keeps its live cash guard from racing unordered corpOps.
    await applyOperatingCashThenDevelopmentCash({
      productLinesV2Enabled: lookups.productLinesV2Enabled,
      db,
      operations: manufacturingDevelopmentCashOps,
      turn: typeof turn === "number" ? turn : 1,
      corporations: lookups.corporations,
      snapshots: corpSnapshots,
      exchangeRatesByCurrency: lookups.exchangeRatesByCurrency,
      bondsByCorpId: lookups.bondsByCorpId,
      sectorsByCorp: lookups.sectorsByCorp,
      constructionLoanDebtByCorpId: lookups.constructionLoanDebtByCorpId,
      mediaProductSlatesEnabled,
      applyOperatingCashWrites: async () => {
        if (corpOps.length === 0) return;
        // bulkWrite op array type does not satisfy AnyBulkWriteOperation narrowing, runtime shape is valid.
        await applyCorporationCashWrites(
          db,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          corpOps as any[],
          foundingCashWitnesses,
          reinvestmentCashWitnesses
        );
        mark("corpCashWrites");
        if (treasuryCashLedgerEnabled) {
          const { settleCorporateOperatingCash } = await import("./operatingCashSettlement");
          await settleCorporateOperatingCash(
            db,
            corpSnapshots,
            turn ?? gameState?.currentTurn ?? 1,
            now
          );
          mark("operatingCashSettlement");
        }
      },
    });
    mark("developmentCash");
  }
  if (productVentureDomainsEnabled.media || productVentureDomainsEnabled.manufacturing) {
    try {
      // Computer-run companies start their own products first; the debit,
      // events and outcome then run through the same path as a player's.
      await startNppVentures(db, {
        turn: typeof turn === "number" ? turn : 1,
        corporations: lookups.corporations,
        sectorsByCorp: lookups.sectorsByCorp,
        exchangeRatesByCurrency: lookups.exchangeRatesByCurrency,
        enabled: productVentureDomainsEnabled,
        reserveAnchor: getNppCashFloorAnchor(
          plantsEnabledForMarketShare ? lookups.preset : undefined
        ),
        priceRatioOf: (commodity, countryId) =>
          lookups.reachablePriceRatioByCountry?.get(countryId)?.get(commodity as never) ??
          lookups.priceRatioByCommodity.get(commodity as never),
        currentYear: gameState?.currentYear,
        techTreesEnabled: gameState?.sectorTechTreesEnabled === true,
      });
    } catch (error) {
      console.error("[corporationTurn] NPP product venture start failed", error);
    }
    mark("nppVentureStarts");
    try {
      await processProductVentures({
        db,
        turn: typeof turn === "number" ? turn : 1,
        corporations: lookups.corporations,
        sectorsByCorp: lookups.sectorsByCorp,
        exchangeRatesByCurrency: lookups.exchangeRatesByCurrency,
        enabled: productVentureDomainsEnabled,
      });
    } catch (error) {
      // A venture fault must never stop the corporation turn.
      console.error("[corporationTurn] product venture processing failed", error);
    }
    mark("productVentures");
  }
  const constructionFinance = await attemptNppConstructionFinance({
    db,
    turn: turn ?? 0,
    requests: nppConstructionFinanceRequests,
    backlogCount: nppConstructionFinanceBacklogCount,
  });
  if (nppConstructionFinanceCandidateCount > 0) {
    corpAuditEntries.push({
      source: "turn",
      category: "corp",
      action: "corp.npp_construction_finance",
      phase: "corporationTurn",
      subject: { type: "corpBatch", name: "NPP private-sector construction" },
      outcome: "ok",
      meta: {
        candidates: nppConstructionFinanceCandidateCount,
        attempted: nppConstructionFinanceRequests.length,
        funded: constructionFinance.funded,
        pendingApproval: constructionFinance.pending,
        deferredOrRejected: constructionFinance.failed,
        failureReasons: constructionFinance.failureReasons,
        turn,
      },
    });
  }
  // Emit only for NPP unlocks proven applied above; the flush dedupes and
  // refunds any debit whose ledger row cannot be persisted (ticket #1998).
  if (nppTechLedger.length > 0) {
    const techFlush = await flushNppTechUnlockLedger(db, nppTechLedger);
    const techAudit = buildTechUnlockFlushAudit(techFlush);
    if (techAudit) corpAuditEntries.push(techAudit);
  }
  // One read plus one bulk write, instead of two serial round trips per
  // accrual against a collection holding one document per currency. Missing
  // pools are still skipped rather than upserted, preserving the legacy sink
  // on pre-migration worlds.
  await creditEquityPoolsBatch(db, equityPoolDividendAccruals, "dividendsIn", now);
  mark("sector+corp bulkWrites");

  // Advertising agreements attribute the spend this turn already settled across
  // each buyer's agreements and spot. Attribution only: no cash, revenue, or
  // market write. Gate off performs zero advertising reads or writes.
  if (mediaOperatingModelsEnabled) {
    const advertisingSectorsByCorp = new Map<string, CoverageSectorInput[]>();
    for (const [corpId, sectors] of lookups.sectorsByCorp) {
      advertisingSectorsByCorp.set(
        corpId,
        sectors.map((sector) => ({
          stateId: sector.stateId,
          revenue: sector.revenue,
          sectorType: sector.sectorType,
          countryId: sector.countryId,
          mothballed: sector.mothballed,
          embargoSuspended: sector.embargoSuspended,
          activeCapacityPercent: sector.activeCapacityPercent,
          strategyId: sector.strategyId,
        }))
      );
    }
    await processAdvertisingTurn(db, {
      enabled: true,
      turn: turn ?? gameState?.currentTurn,
      year: currentYear,
      corpsById: lookups.corpById,
      sectorsByCorp: advertisingSectorsByCorp,
      fxByCurrency: lookups.exchangeRatesByCurrency,
      deliveredAnchorBySellerId: advertisingDeliveredAnchorBySellerId,
      settledSpendAnchorByBuyerId: settledMarketingSpendAnchorByBuyerId,
    });
    mark("advertisingSettlement");
  }

  const currentTurnNumber = turn ?? gameState?.currentTurn ?? 0;
  // One journaled move per order, one bulk receipt write for the cohort, and
  // every settled order's effect applied in bulk. See the module for the move
  // shape and the refusal path.
  const {
    plannedUnitsBySectorId: plannedPoliticalUnitsBySectorId,
    paidSellerBySectorId: paidPoliticalSellerBySectorId,
    settledOrders: settledPoliticalMediaOrders,
  } = politicalMediaMarketEnabled
    ? await settlePoliticalMediaOrdersTurn({
        db,
        orders: politicalMediaOrders,
        turn: turn ?? 0,
        currentTurnNumber,
        plannedByOrderId: plannedPoliticalMediaOrders,
        mediaProductSlatesEnabled,
      })
    : {
        plannedUnitsBySectorId: new Map<string, number>(),
        paidSellerBySectorId: new Map<string, PaidPoliticalMediaSellerAmount>(),
        settledOrders: [] as SettledPoliticalAttentionOrder[],
      };
  if (politicalMediaMarketEnabled) mark("politicalMediaOrders");

  if (mediaProductSlatesEnabled && lookups.mediaProductProjectsBySectorId) {
    const basePrices = eraScaledBasePrices(lookups.eraUnitScale);
    const attributions: ReturnType<typeof attributeMediaProductSales> = [];
    const strategyIdBySectorId = new Map<string, string>();
    for (const sectors of lookups.sectorsByCorp.values()) {
      for (const sector of sectors) {
        if (typeof sector.strategyId === "string") {
          strategyIdBySectorId.set(sector._id.toString(), sector.strategyId);
        }
      }
    }
    for (const [sectorId, projects] of lookups.mediaProductProjectsBySectorId) {
      const clearing = market.clearingBySectorId?.get(sectorId);
      const strategyId = strategyIdBySectorId.get(sectorId);
      if (!clearing?.deliveredUnitsByCommodity || !strategyId) continue;
      const reconciled = reconcileMediaProductDelivery({
        clearing,
        plannedPoliticalUnits: plannedPoliticalUnitsBySectorId.get(sectorId) ?? 0,
        paidPoliticalSeller: paidPoliticalSellerBySectorId.get(sectorId) ?? {
          units: 0,
          amountAnchor: 0,
        },
      });
      attributions.push(
        ...attributeMediaProductSales({
          projects,
          clearing: reconciled.clearing,
          basePrices,
          turn: currentTurnNumber,
          strategyId,
          paidPoliticalUnitsByCommodity: reconciled.paidPoliticalUnitsByCommodity,
          paidPoliticalRevenueAnchorByCommodity: reconciled.paidPoliticalRevenueAnchorByCommodity,
        })
      );
    }
    await persistMediaProductSales(db, attributions);
  }

  if (mediaEditorialEnabled && mediaOperatingModelsEnabled && market.editorialOutletsByState) {
    const outletsByState = addSettledPoliticalAttention({
      commercialOutletsByState: new Map(
        [...market.editorialOutletsByState].map(([stateId, outlets]) => [
          stateId,
          outlets.map((outlet) => ({
            ...outlet,
            attentionUnits: outlet.attentionUnits ?? 0,
          })),
        ])
      ),
      settledOrders: settledPoliticalMediaOrders,
      stanceByCorporationId: new Map(
        [...lookups.corpById].map(([corporationId, corporation]) => [
          corporationId,
          {
            economic: corporation.editorialStance?.economic ?? 0,
            social: corporation.editorialStance?.social ?? 0,
          },
        ])
      ),
    });
    await applyMediaEditorialEffects({
      db,
      turn: turn ?? gameState?.currentTurn ?? 0,
      outletsByState,
    });
  }

  // Contracts read the post-bulkWrite snapshot, so this turn's mothball and
  // production-policy writes are visible to matching.
  await processNppSupplyAgreements(db, turn ?? 0, now, market.plantsEnabled);
  mark("nppSupplyAgreements");

  const nppProspects = await processNppProspecting(db, turn ?? 0, now);
  if (nppProspects > 0) mark("nppProspecting");

  const nppTreasury = await processNppCorpTreasury(db, turn ?? 0, now);
  if (nppTreasury > 0) mark("nppCorpTreasury");

  // Persist per-commodity output quality for next turn's input pillar (quality
  // propagation). Upsert by commodity so the lagged read above stays one turn behind.
  if (newCommodityQuality && newCommodityQuality.size > 0) {
    await db.collection("commodityQuality").bulkWrite(
      [...newCommodityQuality].map(([commodity, quality]) => ({
        updateOne: {
          filter: { commodity },
          update: { $set: { commodity, quality, turn: turn ?? 0, updatedAt: now } },
          upsert: true,
        },
      }))
    );
  }

  // Route the reduced FX spreads skimmed from foreign operating income into the
  // CB system (reserve slice → corp's home CB in the source currency; revenue →
  // source-currency CB). Already deducted from the corp's credited income above.
  await distributeConversionSpreadsBatch(db, sectorFxSpreadFees);

  // v3 Phase 6: translate this turn's strike trigger/resolution events into
  // sentiment pulses. Fired after the bulk writes above, on the now-persisted
  // state, same as every other side effect in this function.
  for (const { sectorType, countryId, event } of strikeEvents) {
    if (event === "started") {
      await fireStrikeStartedPulse(db, sectorType, countryId);
    } else {
      await fireStrikeResolvedPulse(db, sectorType, countryId);
    }
  }
  return { nppNewSectors };
}
