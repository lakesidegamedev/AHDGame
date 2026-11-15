/**
 * Read-only, repeatable census for the unified producer opening plan.
 *
 * Never writes to Mongo. Requires an explicit expected world generation and
 * records the turn fence. Used by the census and apply scripts and by the world
 * reset, which opens a fresh world straight on the funded market.
 */
import { createHash } from "node:crypto";
import type { Collection, Document } from "mongodb";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { depositInsuranceFundsCollection } from "@/lib/db/repositories/depositInsuranceFunds";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { interbankLoansCollection } from "@/lib/db/repositories/interbankLoans";
import { producerMarketShadowsCollection } from "@/lib/db/repositories/producerMarketShadows";
import { savingsAccountsCollection } from "@/lib/db/repositories/savingsAccounts";
import { supplyAgreementsCollection } from "@/lib/db/repositories/supplyAgreements";
import {
  planProducerOpening,
  type ExistingWorldProducerOpening,
} from "@/lib/market/producerMarket/migrationRules";
import { COMMODITY_BASE_PRICES, COMMODITY_TYPES } from "@/lib/constants/commodities";
import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { isStorable } from "@/lib/market/inventory";
import {
  classifySector,
  shadowTurnSettled,
  TRANSITION_BASIS_TURNS,
} from "@/lib/market/producerMarket/transitionRules";
import { HOUSEHOLD_OPENING_TURNS } from "@/lib/market/producerMarket/householdOpeningRules";
import type { GameState } from "@/lib/db/types/gameState";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function positiveRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Builds the opening plan from the live world under a read fence. Shared by the
 * census (writes a private artifact) and the apply script (refuses to write
 * unless the plan digest matches the reviewed census).
 */
export async function captureProducerOpening(
  db: import("mongodb").Db,
  options: { expectedWorldEpoch: string; approvalReference: string; requireActive: boolean }
) {
  const expectedWorldEpochValue = options.expectedWorldEpoch;
  const approvalReferenceValue = options.approvalReference;
  {
    const readFence = () =>
      gameStateCollection<GameState>(db).findOne(
        { _id: "current" },
        {
          projection: {
            worldEpochId: 1,
            currentTurn: 1,
            isActive: 1,
            isProcessing: 1,
            processingKind: 1,
            processingTargetTurn: 1,
            processingAbandonedAt: 1,
            updatedAt: 1,
            preset: 1,
            seedPreset: 1,
          },
        }
      );
    const before = await readFence();
    if (
      !before ||
      before.worldEpochId !== expectedWorldEpochValue ||
      (options.requireActive && before.isActive !== true) ||
      before.isProcessing === true ||
      before.processingKind != null ||
      before.processingTargetTurn != null ||
      before.processingAbandonedAt != null ||
      typeof before.currentTurn !== "number"
    )
      throw new Error("The expected active world is not at an idle turn fence");

    const readConfig = () =>
      gameConfigCollection<{
        _id: string;
        seedPreset?: string;
        preset?: string;
        hardwareInputReliefStartTurn?: number;
        producerTransitionPackageEnabled?: boolean;
        updatedAt?: Date;
      }>(db).findOne(
        { _id: "default" },
        {
          projection: {
            seedPreset: 1,
            preset: 1,
            hardwareInputReliefStartTurn: 1,
            producerTransitionPackageEnabled: 1,
            updatedAt: 1,
          },
        }
      );
    const [gameConfig, source] = await Promise.all([readConfig(), captureSource(db)]);
    const [sourceAgain, gameConfigAgain, after] = await Promise.all([
      captureSource(db),
      readConfig(),
      readFence(),
    ]);
    if (
      !after ||
      (options.requireActive && after.isActive !== true) ||
      after.isProcessing === true ||
      after.processingKind != null ||
      after.processingTargetTurn != null ||
      after.processingAbandonedAt != null ||
      digest(before) !== digest(after) ||
      digest(source) !== digest(sourceAgain) ||
      digest(gameConfig) !== digest(gameConfigAgain)
    )
      throw new Error("The live world changed during the read-only opening census");

    const preset = gameConfig?.seedPreset ?? gameConfig?.preset ?? before.preset ?? "1991-default";
    const rates = new Map(
      source.exchangeRates.map((row: Document) => [row.currencyCode, row.rate])
    );
    const corporationsById = new Map(
      source.corporations.map((row: Document) => [String(row._id), row])
    );
    const pricesByCommodity = new Map(
      source.commodityPrices.map((row: Document) => [row.commodity, row])
    );
    const blockers: string[] = [];

    const normalized: ExistingWorldProducerOpening = {
      worldEpoch: String(before.worldEpochId),
      completedTurn: before.currentTurn,
      processing: false,
      modeledLossPolicy: {
        kind: "openingAdjustment",
        approvalReference: approvalReferenceValue,
      },
      corporations: source.corporations.map((corp: Document) => {
        const id = String(corp._id);
        const currency = resolveCorpLiquidCurrencyCode(corp);
        const rate = currency ? rates.get(currency) : undefined;
        if (!currency || !positiveRate(rate)) blockers.push(`missing-cash-fx:${id}`);
        const producerPayables = corp.producerPayables;
        if (
          producerPayables &&
          (producerPayables.worldEpoch !== before.worldEpochId ||
            !Array.isArray(producerPayables.claims))
        )
          blockers.push(`invalid-payable-generation:${id}`);
        const payables = producerPayables?.claims ?? [];
        return {
          id,
          currency: currency ?? "UNKNOWN",
          localPerAnchor: positiveRate(rate) ? rate : 0,
          cash: corp.liquidCapital,
          operatingArrearsAnchor: payables.reduce(
            (sum: number, claim: { amount: number }) => sum + claim.amount,
            0
          ),
          modeledLossCarry: Object.entries(corp.operatingCashArrearsByCurrency ?? {}).map(
            ([carryCurrency, amount]) => {
              const carryRate = rates.get(carryCurrency);
              if (!positiveRate(carryRate))
                blockers.push(`missing-carry-fx:${id}:${carryCurrency}`);
              return {
                currency: carryCurrency,
                amountLocal: Number(amount),
                localPerAnchor: positiveRate(carryRate) ? carryRate : 0,
              };
            }
          ),
          payables,
        };
      }),
      sectors: source.corporateSectors.map((sector: Document) => {
        const id = String(sector._id);
        const ownerId = String(sector.corporationId);
        const owner: Document | undefined = corporationsById.get(ownerId);
        if (!owner) blockers.push(`missing-owner:${id}`);
        const strategy = getEffectiveStrategyRates(
          sector.sectorType,
          sector.strategyId ?? "standard",
          sector.transitionFromStrategyId,
          sector.transitionStartTurn,
          before.currentTurn,
          preset,
          gameConfig?.hardwareInputReliefStartTurn
        );
        const finalStrategy = getEffectiveStrategyRates(
          sector.sectorType,
          sector.strategyId ?? "standard",
          null,
          null,
          before.currentTurn,
          preset,
          gameConfig?.hardwareInputReliefStartTurn
        );
        const inventoryDailyUnits = sector.inventoryUnits ?? {};
        const candidateCommodities = new Set([
          ...Object.keys(strategy.supply),
          ...Object.keys(finalStrategy.supply),
          ...Object.keys(inventoryDailyUnits),
          ...Object.keys(sector.producerQuotes ?? {}),
        ]);
        const outputs = [...candidateCommodities]
          .filter(
            (commodity) =>
              (strategy.supply as Record<string, number>)[commodity] > 0 ||
              (finalStrategy.supply as Record<string, number>)[commodity] > 0 ||
              (inventoryDailyUnits[commodity] ?? 0) > 0 ||
              sector.producerQuotes?.[commodity] !== undefined
          )
          .map((commodity) => {
            if (!COMMODITY_TYPES.includes(commodity as never)) {
              blockers.push(`unknown-output:${id}:${commodity}`);
              return null;
            }
            const price = pricesByCommodity.get(commodity) as Document | undefined;
            const stateScoped = isStateScopedCommodity(commodity as never);
            const localPrice = stateScoped
              ? price?.statePrices?.[sector.stateId]
              : (price?.reachablePrices?.[owner?.countryId] ?? price?.globalPrice);
            if (!positiveRate(localPrice)) blockers.push(`missing-output-price:${id}:${commodity}`);
            return {
              commodity,
              book: stateScoped ? `state:${sector.stateId}` : "world",
              referenceUnitPrice: positiveRate(localPrice)
                ? localPrice
                : COMMODITY_BASE_PRICES[commodity as keyof typeof COMMODITY_BASE_PRICES],
              storable: isStorable(commodity as never),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        const ownedDailyUnits = sector.capitalStock;
        const paidBookAnchor = sector.capacityBookAnchor;
        if (!Number.isFinite(ownedDailyUnits) || ownedDailyUnits < 0)
          blockers.push(`missing-physical-capacity:${id}`);
        // A plant founded in the completed turn has not been through a sector
        // turn yet, so it has no paid basis. It opens at a zero basis, the same
        // rule the funded market applies to entrants (newEntrantProducerBooks).
        const neverProcessed = sector.operatingCapacityTurn == null;
        if (
          (!Number.isFinite(paidBookAnchor) || paidBookAnchor < 0) &&
          ownedDailyUnits !== 0 &&
          !neverProcessed
        )
          blockers.push(`missing-paid-capacity-basis:${id}`);
        return {
          id,
          accountId: ownerId,
          capacity: {
            ownedDailyUnits: Number.isFinite(ownedDailyUnits) ? ownedDailyUnits : 0,
            paidBookAnchor:
              Number.isFinite(paidBookAnchor) && paidBookAnchor >= 0 ? paidBookAnchor : 0,
            // An order due on the completed turn lands on the next turn in the
            // legacy engine; the opening schedules it for the first funded turn.
            buildQueue: (sector.buildQueue ?? []).map((order: { onlineTurn: number }) =>
              order.onlineTurn <= before.currentTurn
                ? { ...order, onlineTurn: before.currentTurn + 1 }
                : order
            ),
          },
          inventoryDailyUnits,
          inventoryValueAnchor: sector.inventoryValueAnchor ?? 0,
          finalRecipeCommodities: Object.keys(finalStrategy.supply).filter(
            (commodity) => (finalStrategy.supply as Record<string, number>)[commodity] > 0
          ),
          producerQuotes: sector.producerQuotes,
          pricingMode: sector.pricingMode,
          pricingPosture: sector.pricingPosture,
          outputs,
        };
      }),
      protectedImages: Object.entries({
        corporationFiscalAndBankState: source.corporations.map((corp: Document) => ({
          _id: corp._id,
          bankCharter: corp.bankCharter,
          federalTaxArrearsAnchorByCountry: corp.federalTaxArrearsAnchorByCountry,
          producerPayables: corp.producerPayables,
        })),
        bankLoans: source.bankLoans,
        savingsAccounts: source.savingsAccounts,
        centralBanks: source.centralBanks,
        supplyAgreements: source.supplyAgreements,
        interbankLoans: source.interbankLoans,
        depositInsuranceFunds: source.depositInsuranceFunds,
      }).map(([key, value]) => ({ key, digest: digest(value) })),
    };

    let plan: ReturnType<typeof planProducerOpening> | undefined;
    try {
      if (blockers.length > 0) throw new Error("Opening census contains reconciliation blockers");
      plan = planProducerOpening(normalized);
      // Freeze the transition classification from the last settled shadow
      // turns: never a run's opening turns, whose household cushion inflates
      // funded revenue. With the package switched off nothing is classified:
      // a rebuilt economy has no over-built class to land.
      const shadows =
        gameConfig?.producerTransitionPackageEnabled === false
          ? []
          : (
              await producerMarketShadowsCollection<{
                _id: number;
                turn: number;
                runId?: string;
                worldEpoch?: string;
                sectorRevenue?: { sectorId: string; legacy: number; funded: number }[];
              }>(db)
                .find(
                  { worldEpoch: String(before.worldEpochId), sectorRevenue: { $exists: true } },
                  { projection: { sectorRevenue: 1, turn: 1, runId: 1 } }
                )
                .sort({ _id: -1 })
                .limit(TRANSITION_BASIS_TURNS + 4 * HOUSEHOLD_OPENING_TURNS)
                .toArray()
            )
              .filter((d) => shadowTurnSettled(d.runId, d.turn, HOUSEHOLD_OPENING_TURNS))
              .slice(0, TRANSITION_BASIS_TURNS);
      const samplesBySector = new Map<string, { legacy: number; funded: number }[]>();
      for (const doc of [...shadows].reverse())
        for (const row of doc.sectorRevenue ?? [])
          samplesBySector.set(row.sectorId, [
            ...(samplesBySector.get(row.sectorId) ?? []),
            { legacy: row.legacy, funded: row.funded },
          ]);
      if (samplesBySector.size > 0)
        for (const sector of plan.sectors) {
          const samples = samplesBySector.get(sector.id);
          if (samples) sector.transition = classifySector(samples);
        }
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }

    const fiscalArrearsAnchor = source.corporations.reduce(
      (sum: number, corp: Document) =>
        sum +
        Object.values(corp.federalTaxArrearsAnchorByCountry ?? {}).reduce(
          (rowSum: number, value: unknown) => rowSum + (typeof value === "number" ? value : 0),
          0
        ),
      0
    );
    const result = {
      scope: "Read-only current-world census; not a migration apply",
      worldEpoch: before.worldEpochId,
      completedTurn: before.currentTurn,
      corporations: source.corporations.length,
      sectors: source.corporateSectors.length,
      fiscalArrearsAnchor,
      bankLoans: source.bankLoans.length,
      savingsAccounts: source.savingsAccounts.length,
      supplierPayables: normalized.corporations.reduce((sum, row) => sum + row.payables.length, 0),
      blockers: [...new Set(blockers)],
      reconciliation: plan?.reconciliation ?? null,
      nonCashOpeningAdjustments: plan?.nonCashOpeningAdjustments.length ?? null,
    };
    return {
      before,
      after,
      config: gameConfig,
      preset,
      sourceDigest: digest(source),
      source,
      normalized,
      plan,
      planDigest: plan ? digest(plan) : null,
      result: { ...result, planDigest: plan ? digest(plan) : null },
    };
  }
}

async function captureSource(db: import("mongodb").Db) {
  const projection = {
    _id: 1,
    countryId: 1,
    liquidCurrencyCode: 1,
    liquidCapital: 1,
    bankCharter: 1,
    operatingCashArrearsByCurrency: 1,
    federalTaxArrearsAnchorByCountry: 1,
    producerPayables: 1,
  } as const;
  const sectorProjection = {
    _id: 1,
    corporationId: 1,
    countryId: 1,
    stateId: 1,
    sectorType: 1,
    strategyId: 1,
    transitionFromStrategyId: 1,
    transitionStartTurn: 1,
    capitalStock: 1,
    capacityBookAnchor: 1,
    operatingCapacityTurn: 1,
    buildQueue: 1,
    inventoryUnits: 1,
    inventoryValueAnchor: 1,
    producerQuotes: 1,
    pricingMode: 1,
    pricingPosture: 1,
  } as const;
  const all = <T extends Document>(collection: Collection<T>, maxTimeMS = 30_000) =>
    collection.find({}).sort({ _id: 1 }).maxTimeMS(maxTimeMS).toArray();
  const [
    corporations,
    corporateSectors,
    exchangeRates,
    commodityPrices,
    bankLoans,
    savingsAccounts,
    centralBanks,
    supplyAgreements,
    interbankLoans,
    depositInsuranceFunds,
  ] = await Promise.all([
    corporationsCollection<Document>(db)
      .find({}, { projection })
      .sort({ _id: 1 })
      .maxTimeMS(30_000)
      .toArray(),
    corporateSectorsCollection<Document>(db)
      .find({}, { projection: sectorProjection })
      .sort({ _id: 1 })
      .maxTimeMS(30_000)
      .toArray(),
    exchangeRatesCollection<Document>(db)
      .find({}, { projection: { currencyCode: 1, rate: 1 } })
      .sort({ _id: 1 })
      .maxTimeMS(15_000)
      .toArray(),
    commodityPricesCollection<Document>(db)
      .find(
        {},
        { projection: { commodity: 1, globalPrice: 1, statePrices: 1, reachablePrices: 1 } }
      )
      .sort({ _id: 1 })
      .maxTimeMS(15_000)
      .toArray(),
    all(bankLoansCollection<Document>(db)),
    all(savingsAccountsCollection<Document>(db)),
    all(centralBanksCollection<Document>(db)),
    all(supplyAgreementsCollection<Document>(db)),
    all(interbankLoansCollection<Document>(db)),
    all(depositInsuranceFundsCollection<Document>(db)),
  ]);
  return {
    corporations,
    corporateSectors,
    exchangeRates,
    commodityPrices,
    bankLoans,
    savingsAccounts,
    centralBanks,
    supplyAgreements,
    interbankLoans,
    depositInsuranceFunds,
  };
}
