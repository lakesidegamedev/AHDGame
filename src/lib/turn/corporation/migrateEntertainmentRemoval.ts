/**
 * One-time data migration for the removal of the entertainment commodity
 * (2026-10-19). Runs at the start of the corporation turn, before lookups load
 * sectors, so the first turn on the new recipes also runs on rescaled stock.
 *
 * 1. Rescales owned units on every sector whose mix carried entertainment
 *    (entertainmentRemovalRescale.ts), moving the same fields a strategy
 *    switch moves: capital stock, plant ledger, build queue and the per-unit
 *    opex anchor. Each sector update is stamped, so a crash part-way through
 *    never applies the ratio twice.
 * 2. Clears the commodity's keys from sector telemetry maps and macro
 *    contributions.
 * 3. Archives, then deletes, documents keyed by the commodity (prices,
 *    quality, flows, price history, AI supply listings).
 * 4. Stamps gameConfig so later turns skip the whole pass.
 */
import type { AnyBulkWriteOperation, Db, Document } from "mongodb";
import type { CorporationType, MediaDiscriminator } from "@/lib/constants/corporations";
import { rescaleBuildQueueForStrategyChange } from "@/lib/constants/capacityEconomy";
import { entertainmentRemovalRescaleRatio } from "@/lib/corporations/entertainmentRemovalRescale";
import { rescaleOtherOpexAnchorForRetool } from "@/lib/corporations/physicalPnl";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import type { SectorBuildOrder } from "@/lib/db/types";

export const REMOVED_COMMODITY = "entertainment_services";
export const ENTERTAINMENT_REMOVAL_MARKER = "entertainmentCommodityRemovedAtTurn";
export const ENTERTAINMENT_RESCALE_STAMP = "entertainmentRemovalRescaleApplied";
export const RETIRED_COMMODITY_ARCHIVE = "retiredCommodityArchive";

/** Sector telemetry maps keyed by commodity. */
const SECTOR_COMMODITY_MAPS = [
  "soldByCommodity",
  "soldUnitsByCommodity",
  "revenueShareByCommodity",
  "outputUnitsByCommodity",
  "outputAnchorByCommodity",
  "productQualityByCommodity",
  "productLineOutputUnitsByCommodity",
  "productLineSoldUnitsByCommodity",
  "productLineQualityByCommodity",
] as const;

interface RescaleRow {
  _id: unknown;
  sectorType: CorporationType;
  strategyId?: string | null;
  industryModel?: string | null;
  mediaDiscriminator?: MediaDiscriminator | null;
  capitalStock?: number;
  buildQueue?: SectorBuildOrder[];
  otherOpexPerUnitAnchor?: number;
}

/** The `$set` for one sector, or null when its mix never carried entertainment. */
export function entertainmentRescaleSet(
  row: RescaleRow,
  plantsEnabled: boolean
): Record<string, unknown> | null {
  const ratio = entertainmentRemovalRescaleRatio(row);
  if (ratio === 1) return null;
  const set: Record<string, unknown> = { [ENTERTAINMENT_RESCALE_STAMP]: true };
  // Without plants the RPU basis does not apply; stamp only, as a strategy
  // switch does.
  if (!plantsEnabled) return set;
  if (typeof row.capitalStock === "number" && Number.isFinite(row.capitalStock)) {
    set.capitalStock = row.capitalStock * ratio;
    Object.assign(
      set,
      seedPlantLedger(
        row.sectorType,
        set.capitalStock as number,
        row.industryModel,
        row.mediaDiscriminator
      )
    );
  }
  if (Array.isArray(row.buildQueue) && row.buildQueue.length > 0)
    set.buildQueue = rescaleBuildQueueForStrategyChange(row.buildQueue, ratio);
  const opex = rescaleOtherOpexAnchorForRetool(row.otherOpexPerUnitAnchor, ratio);
  if (opex != null) set.otherOpexPerUnitAnchor = opex;
  return set;
}

/** Copy one collection's documents for the commodity to the archive, then delete them. */
async function archiveAndDelete(
  db: Db,
  name: string,
  args: { turn: number; now: Date }
): Promise<{ archived: number; deleted: number }> {
  const docs = await db.collection(name).find({ commodity: REMOVED_COMMODITY }).toArray();
  if (docs.length === 0) return { archived: 0, deleted: 0 };
  await db.collection(RETIRED_COMMODITY_ARCHIVE).bulkWrite(
    docs.map((doc) => ({
      replaceOne: {
        filter: { _id: `${name}:${String(doc._id)}` as never },
        replacement: {
          sourceCollection: name,
          commodity: REMOVED_COMMODITY,
          archivedAtTurn: args.turn,
          archivedAt: args.now,
          doc,
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  const res = await db.collection(name).deleteMany({ commodity: REMOVED_COMMODITY });
  return { archived: docs.length, deleted: res.deletedCount };
}

export async function migrateEntertainmentRemoval(
  db: Db,
  args: { turn: number; plantsEnabled: boolean; now: Date }
): Promise<{ skipped: true } | { rescaled: number; archived: number; deleted: number }> {
  const config = await db
    .collection<Document>("gameConfig")
    .findOne({ _id: "default" as never }, { projection: { [ENTERTAINMENT_REMOVAL_MARKER]: 1 } });
  if (config?.[ENTERTAINMENT_REMOVAL_MARKER] != null) return { skipped: true };

  // 1. Rescale media sectors not yet stamped. Only media rows can carry the mix.
  const rows = (await db
    .collection("corporateSectors")
    .find(
      { sectorType: "media", [ENTERTAINMENT_RESCALE_STAMP]: { $ne: true } },
      {
        projection: {
          sectorType: 1,
          strategyId: 1,
          industryModel: 1,
          mediaDiscriminator: 1,
          capitalStock: 1,
          buildQueue: 1,
          otherOpexPerUnitAnchor: 1,
        },
      }
    )
    .toArray()) as unknown as RescaleRow[];
  const unset = Object.fromEntries(
    SECTOR_COMMODITY_MAPS.map((field) => [`${field}.${REMOVED_COMMODITY}`, ""])
  );
  const ops: AnyBulkWriteOperation<Document>[] = [];
  for (const row of rows) {
    const set = entertainmentRescaleSet(row, args.plantsEnabled);
    if (!set) continue;
    ops.push({
      updateOne: {
        filter: { _id: row._id, [ENTERTAINMENT_RESCALE_STAMP]: { $ne: true } },
        update: { $set: set, $unset: unset },
      },
    });
  }
  if (ops.length > 0) await db.collection("corporateSectors").bulkWrite(ops, { ordered: false });

  // 2. Telemetry keys on any other sector.
  await db.collection("corporateSectors").updateMany(
    {
      $or: SECTOR_COMMODITY_MAPS.map((f) => ({
        [`${f}.${REMOVED_COMMODITY}`]: { $exists: true },
      })),
    },
    { $unset: unset }
  );

  // Macro contributions are recomputed each macro turn; drop the stale key now.
  await db
    .collection("macroCountries")
    .updateMany(
      { [`contribution.byCommodity.${REMOVED_COMMODITY}`]: { $exists: true } },
      { $unset: { [`contribution.byCommodity.${REMOVED_COMMODITY}`]: "" } }
    );

  // 3. Archive, then delete, documents keyed by the commodity.
  const swept = await Promise.all([
    archiveAndDelete(db, "commodityPrices", args),
    archiveAndDelete(db, "commodityQuality", args),
    archiveAndDelete(db, "commodityFlows", args),
    archiveAndDelete(db, "commodityPriceHistory", args),
    archiveAndDelete(db, "supplyListings", args),
  ]);
  const archived = swept.reduce((n, r) => n + r.archived, 0);
  const deleted = swept.reduce((n, r) => n + r.deleted, 0);

  // 4. Done: later turns skip the pass.
  await db
    .collection<Document>("gameConfig")
    .updateOne(
      { _id: "default" as never },
      { $set: { [ENTERTAINMENT_REMOVAL_MARKER]: args.turn, updatedAt: args.now } }
    );
  return { rescaled: ops.length, archived, deleted };
}
