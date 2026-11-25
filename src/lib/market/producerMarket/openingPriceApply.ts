/**
 * Restores commodity opening quotes before the funded market's first turn.
 *
 * Touches only `commodityPrices`: no money, inventories or capacity. Refuses
 * while a turn is processing. A second run finds every price already at base
 * and writes nothing.
 */
import type { AnyBulkWriteOperation, Db, Document } from "mongodb";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commoditiesTables";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { eraScaledBasePrices } from "@/lib/commodities/rules/commodityMarket";
import { getPresetCommodityOpeningPrice } from "@/lib/commodities/rules/openingPrice";
import { loadWorldPreset } from "@/lib/currency/gdpAnchorRate";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { producerOpeningsCollection } from "@/lib/db/repositories/producerOpenings";
import { planOpeningPriceReset, type OpeningPriceDoc } from "./openingPriceRules";

export interface OpeningPriceChange {
  commodity: string;
  globalBefore: number | null;
  globalAfter: number;
  scarcityMultBefore: number | null;
}

export interface OpeningPriceReport {
  status: "applied" | "alreadyAtBase" | "dryRun";
  turn: number;
  commodities: number;
  commoditiesChanged: number;
  pegsKept: number;
  changes: OpeningPriceChange[];
}

export interface NormalizeOpeningPricesOptions {
  dryRun?: boolean;
  /** When given, the live world must be this one. */
  expectedWorldEpoch?: string;
  usePresetOpeningPrices?: boolean;
}

export async function normalizeOpeningPrices(
  db: Db,
  options: NormalizeOpeningPricesOptions = {}
): Promise<OpeningPriceReport> {
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { worldEpochId: 1, currentTurn: 1, isProcessing: 1, producerOpening: 1 } }
  );
  if (!state) throw new Error("The live world gameState document is missing");
  if (options.expectedWorldEpoch && state.worldEpochId !== options.expectedWorldEpoch)
    throw new Error("The expected world is not the live world");
  if (state.isProcessing === true)
    throw new Error("A turn is processing; reset prices between turns");

  const [config, preset] = await Promise.all([
    gameConfigCollection<{ _id: string } & Document>(db).findOne(
      { _id: "default" },
      { projection: { commodityNominalPriceIndex: 1 } }
    ),
    loadWorldPreset(db),
  ]);
  const index = config?.commodityNominalPriceIndex;
  const nominalIndex = typeof index === "number" && Number.isFinite(index) && index > 0 ? index : 1;
  const baseTable = eraScaledBasePrices(getEraUnitScale(preset)) as Record<string, number>;

  const docs = await commodityPricesCollection<OpeningPriceDoc & Document>(db)
    .find(
      {},
      {
        projection: {
          commodity: 1,
          globalPrice: 1,
          statePrices: 1,
          nationalPrices: 1,
          reachablePrices: 1,
          scarcityMult: 1,
          scarcityMultByCountry: 1,
          scarcityImbalanceHistory: 1,
          scarcityImbalanceHistoryByCountry: 1,
          hardPeg: 1,
          stateHardPegs: 1,
          priceAttribution: 1,
        },
      }
    )
    .toArray();

  const ops: AnyBulkWriteOperation<Document>[] = [];
  const changes: OpeningPriceChange[] = [];
  let pegsKept = 0;
  for (const doc of docs) {
    const real = baseTable[doc.commodity] ?? COMMODITY_BASE_PRICES[doc.commodity as never];
    if (!(typeof real === "number" && real > 0)) continue;
    const openingPrice = options.usePresetOpeningPrices
      ? getPresetCommodityOpeningPrice(doc.commodity, preset, real)
      : real;
    const patch = planOpeningPriceReset(doc, openingPrice, nominalIndex);
    pegsKept += patch.pegsKept;
    if (!patch.changed) continue;
    const update: Document = {};
    if (Object.keys(patch.set).length > 0) update.$set = patch.set;
    if (patch.unset.length > 0)
      update.$unset = Object.fromEntries(patch.unset.map((key) => [key, ""]));
    ops.push({ updateOne: { filter: { _id: doc._id }, update } });
    changes.push({
      commodity: doc.commodity,
      globalBefore: typeof doc.globalPrice === "number" ? doc.globalPrice : null,
      globalAfter: (patch.set.globalPrice as number | undefined) ?? doc.globalPrice ?? 0,
      scarcityMultBefore: typeof doc.scarcityMult === "number" ? doc.scarcityMult : null,
    });
  }

  const report: OpeningPriceReport = {
    status: options.dryRun ? "dryRun" : ops.length > 0 ? "applied" : "alreadyAtBase",
    turn: state.currentTurn,
    commodities: docs.length,
    commoditiesChanged: ops.length,
    pegsKept,
    changes,
  };
  if (options.dryRun || ops.length === 0) return report;

  await commodityPricesCollection<Document>(db).bulkWrite(ops, { ordered: false });
  const digest = state.producerOpening?.digest;
  if (digest)
    await producerOpeningsCollection<Document>(db).updateOne(
      { _id: digest as never },
      {
        $set: {
          priceNormalization: {
            turn: state.currentTurn,
            at: new Date(),
            commoditiesChanged: ops.length,
            pegsKept,
          },
        },
      }
    );
  return report;
}
