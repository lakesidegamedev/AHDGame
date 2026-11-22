import type { FundedProducerTurnResult } from "@/lib/turn/corporation/fundedProducerTurn";
import { nextPostureAnchors } from "@/lib/market/producerMarket/postureAnchorRules";
import { HOUSEHOLD_SAVINGS_DRAW_SHARE } from "@/lib/market/producerMarket/householdSpendRules";
import { markStrugglingTransitionSectors } from "@/lib/turn/corporation/transitionStruggling";

import { ObjectId, type AnyBulkWriteOperation } from "mongodb";

import type { CorporateSector } from "@/lib/db/types/corporation";

import { TURNS_PER_DAY } from "@/lib/constants/turnTime";

import {
  backgroundReturnMoves,
  investmentReturnMoves,
  batchProducerMoves,
  treasuryPublicReturnMoves,
  publicReturnMoves,
} from "@/lib/market/producerMarket/liveFundingRules";

import type { FundedReceipt } from "@/lib/market/producerMarket/fundedSectorRules";
import {
  fundedDemandThrottle,
  fundedInputThroughput,
} from "@/lib/market/producerMarket/fundedSectorRules";

import { fundedLedgerRows } from "@/lib/market/producerMarket/fundedLedgerRules";

import type { FundedCountryBookRow } from "@/lib/market/producerMarket/fundedBookRules";

import type { SettlementClose } from "@/lib/market/producerMarket/settlement";
import {
  recordLevyReceipts,
  sweepBatches,
  tariffSweepMoves,
  type TariffClose,
} from "@/lib/turn/corporation/fundedTariffs";

import { capCarry, carryTotal, type LineCarry } from "@/lib/market/producerMarket/publicCarryRules";

import {
  offtakeUnits,
  type CaptiveProduct,
} from "@/lib/market/producerMarket/captiveDeliveryRules";
import { bookPressure, plantPressure } from "@/lib/market/producerMarket/shortageGrowthRules";
import { fundedShortageBuildOps } from "@/lib/turn/corporation/sectorTurn/shortageBuildSpeedup";
import { fundedRecipePressure } from "@/lib/market/producerMarket/fundedRestartRules";

import { laneKeyOf } from "@/lib/market/producerMarket/laneKey";
import { fundedLowSaleStreakStep, fundedTakenShare } from "@/lib/turn/npp/rules/fundedSellThrough";

import { returnStateRunAdvances } from "@/lib/turn/corporation/stateRunAdvance";
import { backgroundTradeOutcomes } from "@/lib/market/producerMarket/backgroundTradeRules";
import { producerFillSpend } from "@/lib/market/producerMarket/rules";
import { recordBackgroundTrade } from "@/lib/turn/corporation/backgroundTraders";
import { runCorporationProducerMarket } from "@/lib/turn/corporation/producerMarketPhase";

import {
  DEMAND_CURVE_PRICE_SENSITIVITY,
  sellerPreferenceFactor,
} from "@/lib/market/producerMarket/demandCurveRules";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import type { Document } from "mongodb";

import { producerHouseholdSourceCollection } from "@/lib/db/repositories/producerHouseholdSource";
import { producerPublicCarryCollection } from "@/lib/db/repositories/producerPublicCarry";
import { producerEconomyAccountsCollection } from "@/lib/db/repositories/producerEconomyAccounts";
import { producerMarketOutcomesCollection } from "@/lib/db/repositories/producerMarketOutcomes";
import { fundedBuyerDemandRows } from "@/lib/market/producerMarket/fundedBuyerDemandRules";
import type { RunFundedProducerTurnStageContext } from "@/lib/turn/corporation/fundedProducerTurn";

export async function settleFundedProducerTurn(
  context: RunFundedProducerTurnStageContext
): Promise<FundedProducerTurnResult> {
  const settled = await runCorporationProducerMarket(context.db, {
    recoveryChecked: true,
    worldEpoch: context.worldEpoch,
    turn: context.turn,
    corporations: context.lookups.corporations,
    deferCorporateCreditsFor: new Set(
      context.input.withholdCorporateTax
        ? [...context.demand.ownerKindByCompany]
            .filter(([, kind]) => kind !== "state")
            .map(([id]) => id)
        : []
    ),
    prepare: () => context.demand.preparedSectors,
    walletScopes: context.walletScopes,
    rates: context.rates,
    demand: {
      ...(context.demand.electricityNetwork
        ? { electricityNetwork: context.demand.electricityNetwork }
        : {}),
      households: context.demand.households,
      // Marketing budgets keep their legacy settlement to media sellers this
      // turn; buying them here as well would spend each budget twice.
      externalOrders: [
        ...context.demand.publicBuyerOrders,
        ...context.demand.investmentBuyerOrders,
        ...context.demand.backgroundOrders,
      ],
      ...(context.demand.backgroundOffers.length > 0
        ? { externalOffers: context.demand.backgroundOffers }
        : {}),
      eligibleOffersByOrder: context.demand.eligibleOffersByOrder,
      ...(context.demand.importTariffs ? { importTariffs: context.demand.importTariffs } : {}),
      spilloverShare: context.input.env.spilloverShare,
      ownSitesFirst: context.input.env.ownSitesFirst,
      // An explicit "market first" supply priority is honoured (issue 5505): own
      // sites get no head start for these companies. Unset keeps own sites first.
      ...(context.input.env.ownSitesFirst
        ? {
            marketFirstAccounts: context.lookups.corporations
              .filter((c) => c.internalSupplyPolicy?.priority === "market")
              .map((c) => c._id.toHexString())
              .sort(),
          }
        : {}),
      stockCoverTurns: context.input.env.stockCoverTurns,
      ...(context.input.env.salesAdvanceAtClearing ? { salesAdvanceAtClearing: true } : {}),
      ...((0, context.validRevenueShare)(context.input.env.salesAdvanceRevenueShare)
        ? { salesAdvanceRevenueShare: context.input.env.salesAdvanceRevenueShare }
        : {}),
      ...(context.input.env.restartProbes ? { restartProbes: true } : {}),
      ...((context.input.env.householdIncomeSpendStage ?? 0) >= 1
        ? {
            householdIncomeSpend: {
              savingsDrawShare:
                context.input.env.householdSavingsDrawShare ?? HOUSEHOLD_SAVINGS_DRAW_SHARE,
            },
          }
        : {}),
      ...((context.input.env.captiveDeliveryStage ?? 0) >= 2 ? { captiveShortValue: true } : {}),
      ...((context.input.env.captiveDeliveryStage ?? 0) >= 3 ? { captiveMarketValue: true } : {}),
      ...(context.input.env.ownSiteValuationCredit ? { ownSiteValuationCredit: true } : {}),
      ...((context.input.env.sellerPreferenceStage ?? 0) >= 1
        ? {
            demandCurve: {
              priceSensitivity: DEMAND_CURVE_PRICE_SENSITIVITY,
              // Stage 1 weighs price alone; stage 2 adds brand and quality.
              preferenceByAccount:
                (context.input.env.sellerPreferenceStage ?? 0) >= 2
                  ? Object.fromEntries(
                      context.lookups.corporations.map((c) => [
                        c._id.toHexString(),
                        sellerPreferenceFactor(c.brandLoyalty, c.averageQuality),
                      ])
                    )
                  : {},
            },
          }
        : {}),
      ...((context.input.env.askBuyerTieStage ?? 0) >= 1 ? { askBuyerTieBreak: true } : {}),
      ...((context.input.env.askBuyerTieStage ?? 0) >= 2 ? { askCompetitorsMatch: true } : {}),
      ...((context.input.env.shortageAskStage ?? 0) >= 1 && context.lastOutcome?.bookPressure
        ? {
            shortageAsk: {
              pressureByLane: context.lastOutcome.bookPressure,
              advertisingFromClearing: true,
              ...(context.input.env.shortageAskMaxStep != null
                ? { maxStep: context.input.env.shortageAskMaxStep }
                : {}),
              ...(context.input.env.priceMaxMultiplier != null
                ? { maxMultiplier: context.input.env.priceMaxMultiplier }
                : {}),
            },
          }
        : {}),
      ...(context.lastOutcome?.laneClearingPrices
        ? { clearingPriceByLane: context.lastOutcome.laneClearingPrices }
        : {}),
      ...(context.lastOutcome?.lanePostureAnchors
        ? { postureAnchorByLane: context.lastOutcome.lanePostureAnchors }
        : {}),
      // Private companies (player and AI) may owe wages and site bills to keep
      // running; state companies run on the treasury advance above instead.
      credit: {
        accountIds: [...context.demand.ownerKindByCompany]
          .flatMap(([id, kind]) => (kind === "state" ? [] : [id]))
          .sort(),
        ...(context.input.env.creditRunTurns != null
          ? { runTurns: context.input.env.creditRunTurns }
          : {}),
        ...(context.input.env.creditStuckTurns != null
          ? { stuckTurns: context.input.env.creditStuckTurns }
          : {}),
      },
      ...(context.demand.electricityNetwork
        ? { countryOfProducer: (id: string) => context.demand.planCountry.get(id) }
        : {}),
      ...((context.input.env.fundedBookStage ?? 0) >= 1
        ? {
            countryOfProducer: (id: string) => context.demand.planCountry.get(id),
            trackCountryBooks: true,
          }
        : {}),
    },
    close: context.closeAtSettlement,
  });

  return publishFundedProducerTurn(context, settled);
}

export type PublishedProducerMarket = Awaited<ReturnType<typeof runCorporationProducerMarket>>;
export type FundedPublicationContext = Pick<
  RunFundedProducerTurnStageContext,
  | "db"
  | "turn"
  | "worldEpoch"
  | "lookups"
  | "advanceCtx"
  | "stateAdvances"
  | "corpById"
  | "openingTurn"
  | "idleSectorIds"
  | "scopeById"
  | "traders"
  | "background"
  | "openingShareByCountry"
  | "shortageOn"
  | "carryShare"
  | "publicWallet"
  | "investmentWallet"
  | "tariffCollector"
  | "tariffScopes"
  | "countryCurrency"
  | "rateOf"
  | "treasuryFunded"
  | "budgetIdByCountry"
  | "apply"
  | "input"
  | "fundedReceiptOf"
> & {
  /** Last turn's posture anchors; null or absent seeds the next ones from this turn's clearing. */
  priorPostureAnchors?: Readonly<Record<string, number>> | null;
  zeroSalesPreviouslyPublished?: boolean;
  demand: Pick<
    RunFundedProducerTurnStageContext["demand"],
    | "headcountBySectorId"
    | "backgroundOffers"
    | "backgroundOrders"
    | "firstWalletByCorp"
    | "planSector"
    | "householdSource"
  > & { funding: { countryId: string }[]; investmentFunding: { countryId: string }[] };
};

export async function publishFundedProducerTurn(
  context: FundedPublicationContext,
  settled: PublishedProducerMarket
): Promise<FundedProducerTurnResult> {
  const treasuryFunded = context.treasuryFunded;
  // Unspent advance returns now, before the remittance sweep later in the turn
  // reads this cash as profit. Keep the in-memory cash the legacy pass reads in step.
  const returned = await returnStateRunAdvances(
    context.db,
    context.advanceCtx,
    context.stateAdvances
  );
  if (returned.size > 0) {
    const rows = await corporationsCollection(context.db)
      .find(
        { _id: { $in: [...returned.keys()].map((id) => new ObjectId(id)) } },
        { projection: { liquidCapital: 1, pendingOperatingCash: 1 } }
      )
      .toArray();
    for (const row of rows) {
      const corp = context.corpById.get(String(row._id));
      if (corp) corp.liquidCapital = row.liquidCapital + (row.pendingOperatingCash ?? 0);
    }
  }

  const supportBySector =
    (settled.result.close?.meta?.supportBySector as Record<string, number> | undefined) ?? {};
  const retiredBookBySector =
    (settled.result.close?.meta?.retiredBookBySector as Record<string, number> | undefined) ?? {};
  const grantBySector =
    (settled.result.close?.meta?.grantBySector as Record<string, number> | undefined) ?? {};
  const retiredIds = Object.keys(retiredBookBySector);
  if (retiredIds.length > 0)
    await corporateSectorsCollection(context.db).bulkWrite(
      retiredIds.map((id) => ({
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: {
            $set: {
              lastDecommission: {
                turn: context.turn,
                retiredBookAnchor: retiredBookBySector[id],
                grantAnchor: grantBySector[id] ?? 0,
              },
            },
          },
        },
      })),
      { ordered: false }
    );
  const receiptsBySectorId = new Map<string, FundedReceipt>();
  // AI saturation reads `demandThrottleFactor`; funded turns write it here.
  const throttleBySectorId = new Map<string, number>();
  // The input gauge the sector page, trace tools and NPP supply deals read.
  const throughputBySectorId = new Map<string, ReturnType<typeof fundedInputThroughput>>();
  // Sectors whose plant delivered to its own company's sites (captiveDeliveryStage).
  const captiveOn = (context.input.env.captiveDeliveryStage ?? 0) >= 1;
  const offtakeBySectorId = new Map<string, number>();
  // A plant whose run short inputs cut was billed wages on the share it made;
  // its reported crew is that share of the planned crew.
  const headcountBySectorId = new Map(context.demand.headcountBySectorId);
  // This turn's taken share (sold plus own-site) per settled sector, for the low-sale streak.
  const sellThroughBySectorId = new Map<string, number | null>();
  for (const sector of settled.closingSectors) {
    const r = sector.producerSettlement;
    const billed =
      r && r.worldEpoch === context.worldEpoch && r.turn === context.turn
        ? r.billedRunShare
        : undefined;
    const planned = headcountBySectorId.get(sector._id.toHexString());
    if (billed != null && planned)
      headcountBySectorId.set(sector._id.toHexString(), {
        desiredWorkers: Math.round(planned.desiredWorkers * billed),
        workers: Math.round(planned.workers * billed),
      });
    if (captiveOn && r && r.worldEpoch === context.worldEpoch && r.turn === context.turn)
      offtakeBySectorId.set(
        sector._id.toHexString(),
        offtakeUnits(r as { soldUnits?: number; products?: CaptiveProduct[] })
      );
    if (r && r.worldEpoch === context.worldEpoch && r.turn === context.turn) {
      receiptsBySectorId.set(
        sector._id.toHexString(),
        (0, context.fundedReceiptOf)(r, supportBySector[sector._id.toHexString()] ?? 0)
      );
      throttleBySectorId.set(
        sector._id.toHexString(),
        fundedDemandThrottle(r.soldUnits, r.offeredUnits)
      );
      throughputBySectorId.set(sector._id.toHexString(), fundedInputThroughput(r));
      sellThroughBySectorId.set(
        sector._id.toHexString(),
        fundedTakenShare({ producerSettlement: r }, context.worldEpoch)
      );
    }
  }
  // Consecutive zero-sales turns per settled sector (AI mothballing reads it),
  // and the funded demand throttle (AI saturation reads it, and the legacy pass
  // would otherwise leave it stale), in one write per sector rather than a
  // second round trip.
  const sectorDocs = corporateSectorsCollection(context.db);
  const sectorUpdates: AnyBulkWriteOperation<CorporateSector>[] = [];
  for (const [id, receipt] of receiptsBySectorId) {
    const soldUnits = captiveOn
      ? (offtakeBySectorId.get(id) ?? receipt.soldUnits)
      : receipt.soldUnits;
    const throttle = throttleBySectorId.get(id) ?? 1;
    const throughput = throughputBySectorId.get(id) ?? fundedInputThroughput(null);
    // Only output that found no buyer is a demand signal. A plant that made
    // nothing (no cash, no inputs, capacity not landed yet) holds its streak,
    // so AI mothballing does not park plants that were never able to sell.
    sectorUpdates.push({
      updateOne: {
        filter: {
          _id: new ObjectId(id),
          "producerSettlement.worldEpoch": context.worldEpoch,
          "producerSettlement.turn": context.turn,
          "producerSettlement.zeroSalesCounted": { $ne: true },
        },
        // A resumed turn whose outcomes were already published may have counted
        // its streaks: it can still reset them, never extend them again.
        update: settledSectorCounterUpdate(
          {
            "producerSettlement.zeroSalesCounted": true,
            demandThrottleFactor: throttle,
            ...throughput,
          },
          soldUnits > 0
            ? "reset"
            : receipt.producedUnits > 0 && !context.zeroSalesPreviouslyPublished
              ? "increment"
              : "hold",
          noRepeatIncrement(
            fundedLowSaleStreakStep(sellThroughBySectorId.get(id) ?? null),
            context.zeroSalesPreviouslyPublished === true
          )
        ),
      },
    });
  }
  if (sectorUpdates.length > 0) await sectorDocs.bulkWrite(sectorUpdates, { ordered: false });
  for (const sectorId of context.idleSectorIds)
    if (!receiptsBySectorId.has(sectorId))
      receiptsBySectorId.set(sectorId, { revenue: 0, profit: 0, producedUnits: 0, soldUnits: 0 });
  // An idle sector settled this turn at zero: advance its generation with the
  // rest, or the next turn would reject it as unreconciled once it can produce.
  if (context.idleSectorIds.length > 0)
    await corporateSectorsCollection(context.db).bulkWrite(
      context.idleSectorIds.map((id) => ({
        updateOne: {
          filter: {
            _id: new ObjectId(id),
            "producerCapacity.worldEpoch": context.worldEpoch,
            "producerCapacity.turn": { $gte: context.openingTurn, $lt: context.turn },
          },
          update: {
            $set: {
              producerCapacity: { worldEpoch: context.worldEpoch, turn: context.turn },
              "producerInventory.worldEpoch": context.worldEpoch,
              "producerInventory.turn": context.turn,
              // Nothing ran, so no input bound; the legacy gauge no longer writes it.
              ...fundedInputThroughput(null),
            },
          },
        },
      })),
      { ordered: false }
    );
  const settledProfitByCorp = new Map(
    [...settled.operatingByCorporation].map(([id, o]) => [id, o.profit])
  );

  // Funded supply and demand for the price phase (slice S7).
  const sectorState = new Map<string, string>();
  for (const corp of context.lookups.corporations)
    for (const sector of context.lookups.sectorsByCorp.get(corp._id.toString()) ?? [])
      sectorState.set(sector._id.toString(), sector.stateId);
  const stateOfWallet = (id: string) => context.scopeById.get(id)?.stateId ?? null;
  // Stage on: a stateless national wallet (public, military, investment)
  // counts in its country's national book, not the world total only.
  const nationalPublicDemandOn = (context.input.env.nationalPublicDemandStage ?? 0) >= 1;
  // A background country has no state: its orders and offers count in its
  // own national book whatever the stage.
  const backgroundCountryOf = new Map(context.traders.map((t) => [t.accountId, t.countryId]));
  const rows = fundedLedgerRows({
    outcomes: settled.result.orderOutcomes,
    products: [
      ...settled.result.producers.flatMap((p) =>
        p.products.map((x) => ({
          producerId: p.id,
          commodity: x.commodity,
          book: x.book,
          offeredUnits: x.offeredUnits,
        }))
      ),
      ...context.demand.backgroundOffers.map((o) => ({
        producerId: o.accountId,
        commodity: o.commodity,
        book: o.book,
        offeredUnits: o.units,
        ...(o.countryId ? { countryId: o.countryId } : {}),
      })),
    ],
    stateOfAccount: (id) => {
      const wallet = stateOfWallet(id);
      if (wallet) return wallet;
      const first = context.demand.firstWalletByCorp.get(id);
      return first ? stateOfWallet(first.wallet) : null;
    },
    ...(nationalPublicDemandOn || backgroundCountryOf.size > 0
      ? {
          countryOfAccount: (id: string) => {
            const backgroundCountry = backgroundCountryOf.get(id);
            if (backgroundCountry) return backgroundCountry;
            if (!nationalPublicDemandOn) return null;
            const own = context.scopeById.get(id)?.countryId;
            if (own) return own;
            const first = context.demand.firstWalletByCorp.get(id);
            return first ? (context.scopeById.get(first.wallet)?.countryId ?? null) : null;
          },
        }
      : {}),
    stateOfProducer: (id) => sectorState.get(context.demand.planSector.get(id) ?? "") ?? null,
    unitScale: TURNS_PER_DAY,
  });
  // Measured shortage per book (shortage growth) and per recipe (AI restarts).
  const restartOn = (context.input.env.fundedRestartStage ?? 0) >= 1;
  const buildFactor = context.input.env.shortageBuildFactor;
  const buildSpeedupOn = typeof buildFactor === "number" && buildFactor > 0 && buildFactor < 1;
  const pressureNow =
    context.shortageOn || restartOn || buildSpeedupOn
      ? bookPressure(settled.result.orderOutcomes ?? [])
      : undefined;
  const pressureByBookNow = pressureNow ? new Map(Object.entries(pressureNow)) : undefined;
  // World-book clearing price per commodity, for next turn's buyer references, and
  // per lane in every book, for next turn's automatic asks.
  const clearingPrices: Record<string, number> = {};
  const laneClearingPrices: Record<string, number> = {};
  for (const row of settled.result.prices) {
    if (!(row.units > 0 && row.value > 0)) continue;
    laneClearingPrices[laneKeyOf(row.commodity, row.book)] = row.value / row.units;
    if (row.book === "world") clearingPrices[row.commodity] = row.value / row.units;
  }
  // Per-country funded book, on the price phase's per-turn basis. The price
  // phase reads it instead of the modelled clearing when the stage is on.
  const countryBooks =
    (context.input.env.fundedBookStage ?? 0) >= 1
      ? settled.result.countryBooks?.map((row): FundedCountryBookRow => ({
          countryId: row.countryId,
          commodity: row.commodity,
          supply: row.supply * TURNS_PER_DAY,
          demand: row.demand * TURNS_PER_DAY,
          imports: row.imports * TURNS_PER_DAY,
          exports: row.exports * TURNS_PER_DAY,
          ...(row.requested != null ? { requested: row.requested * TURNS_PER_DAY } : {}),
          ...(row.funded != null ? { funded: row.funded * TURNS_PER_DAY } : {}),
          ...(row.filled != null ? { filled: row.filled * TURNS_PER_DAY } : {}),
          ...(row.spilloverRequested != null
            ? { spilloverRequested: row.spilloverRequested * TURNS_PER_DAY }
            : {}),
        }))
      : undefined;
  const tariffMeta = settled.result.close?.meta?.importTariffs as
    (TariffClose["meta"] & { paidByAccount: Record<string, number> }) | undefined;
  const tariffPaidBy = tariffMeta?.paidByAccount ?? {};
  // What each background country sold and bought, read back by its macro
  // kernel so its capacity follows the trade it really did.
  const backgroundTrade =
    context.traders.length > 0
      ? backgroundTradeOutcomes({
          economies: context.traders,
          offers: context.demand.backgroundOffers,
          orders: context.demand.backgroundOrders,
          openingCash: new Map(settled.openingAccounts.map((a) => [a.id, a.cash])),
          // Tariff a background country paid on imports is not a smaller export.
          closingCash: new Map(
            settled.result.accounts.map((a) => [a.id, a.cash + (tariffPaidBy[a.id] ?? 0)])
          ),
          fills: producerFillSpend(settled.result.tradeReceipt),
        })
      : null;
  if (backgroundTrade)
    await recordBackgroundTrade(context.db, context.turn, context.traders, backgroundTrade);
  if (
    context.demand.householdSource &&
    context.openingShareByCountry &&
    context.openingShareByCountry.size === 0
  )
    await producerHouseholdSourceCollection<{ _id: string }>(context.db).updateOne(
      { _id: context.worldEpoch },
      {
        $setOnInsert: {
          worldEpoch: context.worldEpoch,
          turn: context.turn,
          shareByCountry: context.demand.householdSource.currentShares,
          at: new Date(),
        },
      } as never,
      { upsert: true }
    );
  await producerMarketOutcomesCollection<{ _id: string }>(context.db).replaceOne(
    { _id: `${context.worldEpoch}:${context.turn}` },
    {
      _id: `${context.worldEpoch}:${context.turn}`,
      worldEpoch: context.worldEpoch,
      turn: context.turn,
      rows,
      buyerDemand: fundedBuyerDemandRows(settled.result.orderOutcomes ?? [], TURNS_PER_DAY),
      ...((context.input.env.clearingReferenceStage ?? 0) >= 1 ? { clearingPrices } : {}),
      laneClearingPrices,
      lanePostureAnchors: nextPostureAnchors(
        context.priorPostureAnchors ?? undefined,
        laneClearingPrices
      ),
      ...(countryBooks && countryBooks.length > 0 ? { books: countryBooks } : {}),
      ...(settled.result.regionalBooks ? { regionalBuildBooks: settled.result.regionalBooks } : {}),
      ...(pressureNow ? { bookPressure: pressureNow } : {}),
      ...(restartOn && pressureNow
        ? {
            recipePressure: fundedRecipePressure({
              // Running plants publish the shortage each reads on its main line.
              running: settled.closingSectors.flatMap((s) => {
                const r = s.producerSettlement;
                if (s.mothballed === true || !r || r.turn !== context.turn) return [];
                const products = (r as { products?: Parameters<typeof plantPressure>[0] }).products;
                return [
                  {
                    sectorType: s.sectorType,
                    strategyId: s.strategyId,
                    pressure: plantPressure(products, pressureByBookNow),
                    deliveredUnits:
                      (r as { deliveredUnits?: number }).deliveredUnits ?? r.soldUnits ?? 0,
                  },
                ];
              }),
              // A recipe with no running plant publishes nothing, so a fully
              // mothballed one reads its own output lanes instead.
              mothballed: settled.closingSectors.flatMap((s) => {
                const r = s.producerSettlement;
                if (s.mothballed !== true || !r || r.turn !== context.turn) return [];
                return [
                  {
                    sectorType: s.sectorType,
                    strategyId: s.strategyId,
                    products: (r as { products?: Parameters<typeof plantPressure>[0] }).products,
                  },
                ];
              }),
              pressureByBook: pressureByBookNow,
            }),
          }
        : {}),
      ...(context.demand.householdSource
        ? { householdSource: context.demand.householdSource }
        : {}),
      ...(backgroundTrade ? { backgroundTrade: Object.fromEntries(backgroundTrade) } : {}),
      at: new Date(),
    } as never,
    { upsert: true }
  );

  // Close and transition support settled with the market (see closeAtSettlement).
  const close = settled.result.close;
  const paidByCountry = new Map(
    Object.entries((close?.meta?.paidByCountry as Record<string, number> | undefined) ?? {})
  );
  await producerMarketOutcomesCollection<{ _id: string }>(context.db).updateOne(
    { _id: `${context.worldEpoch}:${context.turn}` },
    {
      $set: {
        transitionSupport: {
          paid: Object.fromEntries(paidByCountry),
          coverage: (close?.meta?.coverageByCountry as Record<string, number> | undefined) ?? {},
        },
        closeTransfers: close?.transfers.length ?? 0,
        ...(tariffMeta
          ? {
              importTariffs: {
                collectedByImporter: tariffMeta.collectedByImporter,
                paid: tariffMeta.paid,
                shortfall: tariffMeta.shortfall,
              },
            }
          : {}),
        ...(settled.result.spillover ? { spillover: settled.result.spillover } : {}),
      },
    }
  );

  // Return what each public and construction buyer actually holds. Deriving
  // it from settled anchor cash times the rate drifted by float error past
  // the real balance, and the debit's guard refused the whole move.
  const returnWallets = [
    ...context.demand.funding.map((f) => ({
      countryId: f.countryId,
      id: (0, context.publicWallet)(f.countryId),
    })),
    ...context.demand.investmentFunding.map((f) => ({
      countryId: f.countryId,
      id: (0, context.investmentWallet)(f.countryId),
    })),
  ];
  const heldLocal = new Map(
    (
      await producerEconomyAccountsCollection<{ _id: string; cash: number }>(context.db)
        .find(
          {
            _id: {
              $in: [
                ...returnWallets.map((w) => w.id),
                ...context.traders.map((t) => t.accountId),
                ...context.tariffCollector.values(),
              ],
            },
          },
          { projection: { cash: 1 } }
        )
        .toArray()
    ).map((w) => [w._id, w.cash])
  );
  const carryTarget =
    (settled.result.close?.meta?.publicCarryTarget as Record<string, LineCarry> | undefined) ?? {};
  const keptCarry: Record<string, LineCarry> = {};
  // What a public wallet keeps for next turn instead of burning: the carry
  // target, capped at what it really holds (transition support and grants were
  // paid from the rest).
  const keptLocal = new Map<string, number>();
  for (const f of context.demand.funding) {
    const target = carryTarget[f.countryId];
    if (!target) continue;
    const id = (0, context.publicWallet)(f.countryId);
    const rate = (0, context.rateOf)(context.countryCurrency.get(f.countryId));
    const held = heldLocal.get(id) ?? 0;
    const kept = capCarry(target, Number.isFinite(held) ? held / rate : 0);
    const keptTotal = carryTotal(kept);
    if (!(keptTotal > 0)) continue;
    keptCarry[f.countryId] = kept;
    keptLocal.set(id, Math.min(held, keptTotal * rate));
  }
  if (context.carryShare > 0)
    await producerPublicCarryCollection<{ _id: string }>(context.db).replaceOne(
      { _id: `${context.worldEpoch}:${context.turn}` },
      {
        _id: `${context.worldEpoch}:${context.turn}`,
        worldEpoch: context.worldEpoch,
        turn: context.turn,
        byCountry: keptCarry,
        at: new Date(),
      } as never,
      { upsert: true }
    );
  const returnRow = (countryId: string, id: string) => {
    const left = (heldLocal.get(id) ?? 0) - (keptLocal.get(id) ?? 0);
    if (!(Number.isFinite(left) && left > 0)) return [];
    const currency = context.countryCurrency.get(countryId)!;
    return [
      {
        countryId,
        walletId: id,
        amountLocal: left,
        currencyCode: currency,
        localPerAnchor: (0, context.rateOf)(currency),
      },
    ];
  };
  const publicReturnRows = context.demand.funding.flatMap((f) =>
    returnRow(f.countryId, (0, context.publicWallet)(f.countryId))
  );
  if (treasuryFunded)
    await (0, context.apply)(
      treasuryPublicReturnMoves(
        context.worldEpoch,
        context.turn,
        publicReturnRows.flatMap((row) => {
          const budget = treasuryFunded.get(row.countryId);
          return budget ? [{ ...row, budgetId: budget.budgetId }] : [];
        })
      )
    );
  if (!treasuryFunded || publicReturnRows.some((row) => !treasuryFunded.has(row.countryId)))
    await (0, context.apply)(
      batchProducerMoves(
        context.worldEpoch,
        context.turn,
        publicReturnMoves(
          context.worldEpoch,
          context.turn,
          treasuryFunded
            ? publicReturnRows.filter((row) => !treasuryFunded.has(row.countryId))
            : publicReturnRows
        )
      )
    );
  // Faster construction where the funded book is short (fresh worlds start far
  // short of real demand; gameConfig.producerShortageBuildFactor).
  if (buildSpeedupOn && pressureNow) {
    const pressureByBook = pressureByBookNow!;
    const ops = fundedShortageBuildOps({
      sectors: settled.closingSectors.map((s) => {
        const r = s.producerSettlement;
        return {
          _id: s._id,
          buildQueue: s.buildQueue,
          mothballed: s.mothballed,
          pressure:
            r && r.turn === context.turn
              ? plantPressure(
                  (r as { products?: Parameters<typeof plantPressure>[0] }).products,
                  pressureByBook
                )
              : undefined,
        };
      }),
      currentTurn: context.turn,
      factor: buildFactor,
      now: new Date(),
    });
    if (ops.length > 0)
      await corporateSectorsCollection<Document>(context.db).bulkWrite(ops as never, {
        ordered: false,
      });
  }
  await (0, context.apply)(
    batchProducerMoves(
      context.worldEpoch,
      context.turn,
      investmentReturnMoves(
        context.worldEpoch,
        context.turn,
        context.demand.investmentFunding.flatMap((f) =>
          returnRow(f.countryId, (0, context.investmentWallet)(f.countryId))
        )
      )
    )
  );

  // Collected import tariffs go to each importer's Treasury cash.
  const tariffSweep = tariffSweepMoves({
    worldEpoch: context.worldEpoch,
    turn: context.turn,
    collectors: context.tariffScopes.map((s) => ({
      countryId: s.countryId,
      walletId: context.tariffCollector.get(s.countryId)!,
      currency: s.currency,
    })),
    heldLocal,
    budgetIdOf: (c) => context.budgetIdByCountry.get(c) ?? null,
    rateOf: context.rateOf,
    levyAnchorByCountry: tariffMeta?.automationLevy?.collectedByCountry,
  });
  for (const batch of sweepBatches(context.worldEpoch, context.turn, tariffSweep))
    await (0, context.apply)(batch);
  await recordLevyReceipts(context.db, tariffSweep);

  // A background wallet ends the turn empty: its unspent budget and its export
  // receipts leave the world economy, as its budget came in.
  await (0, context.apply)(
    batchProducerMoves(
      context.worldEpoch,
      context.turn,
      backgroundReturnMoves(
        context.worldEpoch,
        context.turn,
        context.traders.flatMap((t) => {
          const held = heldLocal.get(t.accountId) ?? 0;
          if (!(Number.isFinite(held) && held > 0)) return [];
          return [
            {
              countryId: t.countryId,
              walletId: t.accountId,
              amountLocal: held,
              currencyCode: t.currency,
              localPerAnchor: (0, context.rateOf)(t.currency),
            },
          ];
        })
      )
    )
  );

  // Transition relief for sectors that struggle after the switch (owner
  // decision 2026-10-21): mark them and tell their owners once.
  await markStrugglingTransitionSectors(
    context.db,
    context.lookups,
    receiptsBySectorId,
    context.turn,
    context.input.firstFundedTurn,
    (context.input.env.captiveDeliveryStage ?? 0) >= 3
  );

  const deferredDistributions = new Map<
    string,
    NonNullable<import("./types").CorpSnapshot["deferredProducerDistributions"]>
  >();
  for (const transfer of (close?.meta?.deferredCorporateDistributions ??
    []) as SettlementClose["transfers"]) {
    const scope = context.scopeById.get(transfer.toAccountId);
    if (!scope) throw new Error("Deferred corporate distribution wallet unavailable");
    deferredDistributions.set(transfer.fromAccountId, [
      ...(deferredDistributions.get(transfer.fromAccountId) ?? []),
      {
        walletId: transfer.toAccountId,
        worldEpoch: context.worldEpoch,
        amountAnchor: transfer.amountAnchor,
        currency: scope.currency,
        localPerAnchor: (0, context.rateOf)(scope.currency),
      },
    ]);
  }
  return {
    receiptsBySectorId,
    settledProfitByCorp,
    headcountBySectorId,
    deferredDistributions,
    tradeReceipt: settled.result.tradeReceipt,
    turnWarnings: [...(settled.result.turnWarnings ?? []), ...context.background.warnings],
  };
}

type StreakStep = "increment" | "reset" | "hold";

/**
 * One settled sector's write: the given fields plus the zero-sales and
 * low-sale streaks. A reset sets the counter to 0, an increment adds one, a
 * hold leaves the stored value untouched.
 */
export function settledSectorCounterUpdate(
  set: Partial<CorporateSector> & { "producerSettlement.zeroSalesCounted"?: true },
  zeroSales: StreakStep,
  lowSale: StreakStep
): { $set: Record<string, unknown>; $inc?: Record<string, number> } {
  const $set: Record<string, unknown> = { ...set };
  const $inc: Record<string, number> = {};
  if (zeroSales === "reset") $set.producerZeroSalesTurns = 0;
  else if (zeroSales === "increment") $inc.producerZeroSalesTurns = 1;
  if (lowSale === "reset") $set.fundedLowSaleTurns = 0;
  else if (lowSale === "increment") $inc.fundedLowSaleTurns = 1;
  return Object.keys($inc).length > 0 ? { $set, $inc } : { $set };
}

/** A replayed settlement may reset a streak but never extends it twice. */
export function noRepeatIncrement(step: StreakStep, alreadyPublished: boolean): StreakStep {
  return alreadyPublished && step === "increment" ? "hold" : step;
}
