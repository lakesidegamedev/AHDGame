/**
 * Read-only, repeatable census for the unified producer opening plan.
 *
 * This command never writes to Mongo. It requires an explicit expected world
 * generation, records the live turn fence and writes a mode-0600 local artifact.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  planProducerOpening,
  type ExistingWorldProducerOpening,
} from "@/lib/market/producerMarket/migrationRules";
import { COMMODITY_BASE_PRICES, COMMODITY_TYPES } from "@/lib/constants/commodities";
import { getEffectiveStrategyRatesForOperatingModel } from "@/lib/constants/sectorStrategies";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { isStorable } from "@/lib/market/inventory";
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
      db.collection<GameState>("gameState").findOne(
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
      db
        .collection<{
          _id: string;
          seedPreset?: string;
          preset?: string;
          hardwareInputReliefStartTurn?: number;
          updatedAt?: Date;
        }>("gameConfig")
        .findOne(
          { _id: "default" },
          {
            projection: {
              seedPreset: 1,
              preset: 1,
              hardwareInputReliefStartTurn: 1,
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
    const rates = new Map(source.exchangeRates.map((row: any) => [row.currencyCode, row.rate]));
    const corporationsById = new Map(source.corporations.map((row: any) => [String(row._id), row]));
    const pricesByCommodity = new Map(
      source.commodityPrices.map((row: any) => [row.commodity, row])
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
      corporations: source.corporations.map((corp: any) => {
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
      sectors: source.corporateSectors.map((sector: any) => {
        const id = String(sector._id);
        const ownerId = String(sector.corporationId);
        const owner: any = corporationsById.get(ownerId);
        if (!owner) blockers.push(`missing-owner:${id}`);
        const strategy = getEffectiveStrategyRatesForOperatingModel(
          sector.sectorType,
          sector.strategyId ?? "standard",
          sector.transitionFromStrategyId,
          sector.transitionStartTurn,
          before.currentTurn,
          sector.industryModel,
          sector.mediaDiscriminator,
          preset,
          gameConfig?.hardwareInputReliefStartTurn
        );
        const finalStrategy = getEffectiveStrategyRatesForOperatingModel(
          sector.sectorType,
          sector.strategyId ?? "standard",
          null,
          null,
          before.currentTurn,
          sector.industryModel,
          sector.mediaDiscriminator,
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
            const price = pricesByCommodity.get(commodity) as any;
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
        if ((!Number.isFinite(paidBookAnchor) || paidBookAnchor < 0) && ownedDailyUnits !== 0)
          blockers.push(`missing-paid-capacity-basis:${id}`);
        return {
          id,
          accountId: ownerId,
          capacity: {
            ownedDailyUnits: Number.isFinite(ownedDailyUnits) ? ownedDailyUnits : 0,
            paidBookAnchor:
              Number.isFinite(paidBookAnchor) && paidBookAnchor >= 0 ? paidBookAnchor : 0,
            buildQueue: sector.buildQueue ?? [],
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
        corporationFiscalAndBankState: source.corporations.map((corp: any) => ({
          _id: corp._id,
          bankCharter: corp.bankCharter,
          federalTaxArrearsAnchorByCountry: corp.federalTaxArrearsAnchorByCountry,
          producerPayables: corp.producerPayables,
        })),
        bankLoans: source.bankLoans,
        savingsAccounts: source.savingsAccounts,
        centralBanks: source.centralBanks,
        supplyAgreements: source.supplyAgreements,
        corporateGroups: source.corporateGroups,
        interbankLoans: source.interbankLoans,
        depositInsuranceFunds: source.depositInsuranceFunds,
      }).map(([key, value]) => ({ key, digest: digest(value) })),
    };

    let plan: ReturnType<typeof planProducerOpening> | undefined;
    try {
      if (blockers.length > 0) throw new Error("Opening census contains reconciliation blockers");
      plan = planProducerOpening(normalized);
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }

    const fiscalArrearsAnchor = source.corporations.reduce(
      (sum: number, corp: any) =>
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

function cliSetup() {
  const args = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) throw new Error(`Expected --name=value, got ${arg}`);
    args.set(match[1], match[2]);
  }

  const expectedWorldEpoch = args.get("expected-world-epoch");
  const approvalReference = args.get("approval-reference");
  const outputPath = args.get("output");
  const envPath = args.get("env-file");
  if (!expectedWorldEpoch || !approvalReference || !outputPath || !envPath)
    throw new Error(
      "Usage: captureProducerOpening.ts --expected-world-epoch=<id> --approval-reference=<decision> --env-file=<path> --output=<private-json>"
    );
  const expectedWorldEpochValue = expectedWorldEpoch as string;
  const approvalReferenceValue = approvalReference as string;
  const outputPathValue = outputPath as string;
  const envPathValue = envPath as string;

  const requireFromProject = createRequire(resolve(process.cwd(), "package.json"));
  const { MongoClient } = requireFromProject("mongodb") as typeof import("mongodb");
  const dotenv = requireFromProject("dotenv") as typeof import("dotenv");
  const env = dotenv.parse(readFileSync(envPathValue, "utf8"));
  const uriKey = args.get("uri-key") ?? "HEAL_MONGODB_URI_PROD";
  const uri = env[uriKey];
  if (!uri) throw new Error(`The explicit connection ${uriKey} is missing`);
  const databaseName =
    env.MONGODB_DB ||
    env.MONGO_DB_NAME ||
    decodeURIComponent(
      (uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/) ?? [])[1] ?? "a-house-divided"
    );
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  return {
    expectedWorldEpochValue,
    approvalReferenceValue,
    outputPathValue,
    client,
    databaseName,
  };
}

async function main() {
  const { expectedWorldEpochValue, approvalReferenceValue, outputPathValue, client, databaseName } =
    cliSetup();
  try {
    await client.connect();
    const db = client.db(databaseName);
    const artifact = await captureProducerOpening(db, {
      expectedWorldEpoch: expectedWorldEpochValue,
      approvalReference: approvalReferenceValue,
      requireActive: true,
    });
    const destination = resolve(outputPathValue);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, `${JSON.stringify(artifact, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    console.log(JSON.stringify(artifact.result));
  } finally {
    await client.close();
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
    industryModel: 1,
    mediaDiscriminator: 1,
    strategyId: 1,
    transitionFromStrategyId: 1,
    transitionStartTurn: 1,
    capitalStock: 1,
    capacityBookAnchor: 1,
    buildQueue: 1,
    inventoryUnits: 1,
    inventoryValueAnchor: 1,
    producerQuotes: 1,
    pricingMode: 1,
    pricingPosture: 1,
  } as const;
  const readAll = async (name: string) =>
    db.collection(name).find({}).sort({ _id: 1 }).maxTimeMS(30_000).toArray();
  const [
    corporations,
    corporateSectors,
    exchangeRates,
    commodityPrices,
    bankLoans,
    savingsAccounts,
    centralBanks,
    supplyAgreements,
    corporateGroups,
    interbankLoans,
    depositInsuranceFunds,
  ] = await Promise.all([
    db
      .collection("corporations")
      .find({}, { projection })
      .sort({ _id: 1 })
      .maxTimeMS(30_000)
      .toArray(),
    db
      .collection("corporateSectors")
      .find({}, { projection: sectorProjection })
      .sort({ _id: 1 })
      .maxTimeMS(30_000)
      .toArray(),
    db
      .collection("exchangeRates")
      .find({}, { projection: { currencyCode: 1, rate: 1 } })
      .sort({ _id: 1 })
      .maxTimeMS(15_000)
      .toArray(),
    db
      .collection("commodityPrices")
      .find(
        {},
        { projection: { commodity: 1, globalPrice: 1, statePrices: 1, reachablePrices: 1 } }
      )
      .sort({ _id: 1 })
      .maxTimeMS(15_000)
      .toArray(),
    readAll("bankLoans"),
    readAll("savingsAccounts"),
    readAll("centralBanks"),
    readAll("supplyAgreements"),
    readAll("corporateGroups"),
    readAll("interbankLoans"),
    readAll("depositInsuranceFunds"),
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
    corporateGroups,
    interbankLoans,
    depositInsuranceFunds,
  };
}

if (process.argv[1]?.endsWith("captureProducerOpening.ts"))
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message.replace(/mongodb[^\s]*/gi, "[connection]")
        : "Read-only producer opening capture failed"
    );
    process.exitCode = 1;
  });
