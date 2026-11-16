import type { Collection, Db, Document, ObjectId } from "mongodb";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { billsCollection } from "@/lib/db/repositories/bills";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { stateBillsCollection } from "@/lib/db/repositories/stateBills";
import { subsidiesCollection } from "@/lib/db/repositories/subsidies";

/**
 * "renewables" no longer exists: stored references move to wind (open since
 * 1999, unlike solar), and a renewables subsidy splits into wind and solar.
 */

export const LEGACY_METHOD = "renewables";
export const WIND = "wind";
export const SOLAR = "solar";

async function moveSectors(db: Db, dryRun: boolean): Promise<[number, number]> {
  const sectors = corporateSectorsCollection<Document>(db);
  const moves: Array<[Document, Document, Document[] | undefined]> = [
    [{ strategyId: LEGACY_METHOD }, { $set: { strategyId: WIND } }, undefined],
    [
      { transitionFromStrategyId: LEGACY_METHOD },
      { $set: { transitionFromStrategyId: WIND } },
      undefined,
    ],
    [
      { "parentDirectedStrategy.strategyId": LEGACY_METHOD },
      { $set: { "parentDirectedStrategy.strategyId": WIND } },
      undefined,
    ],
    [
      { "buildQueue.strategyId": LEGACY_METHOD },
      { $set: { "buildQueue.$[order].strategyId": WIND } },
      [{ "order.strategyId": LEGACY_METHOD }],
    ],
  ];
  let scanned = 0;
  let updated = 0;
  for (const [filter, update, arrayFilters] of moves) {
    scanned += await sectors.countDocuments(filter);
    if (dryRun) continue;
    const res = await sectors.updateMany(filter, update, arrayFilters ? { arrayFilters } : {});
    updated += res.modifiedCount;
  }
  return [scanned, updated];
}

async function moveSubsidies(db: Db, dryRun: boolean): Promise<[number, number]> {
  const subsidies = subsidiesCollection<Document>(db);
  const legacy = await subsidies.find({ targetStrategyId: LEGACY_METHOD }).toArray();
  if (dryRun) return [legacy.length, 0];
  let updated = 0;
  for (const doc of legacy) {
    const { _id, ...rest } = doc as Document & { _id: ObjectId };
    const res = await subsidies.updateOne(
      { _id, targetStrategyId: LEGACY_METHOD },
      { $set: { targetStrategyId: WIND } }
    );
    if (res.modifiedCount === 0) continue;
    updated += 1;
    await subsidies.insertOne({ ...rest, targetStrategyId: SOLAR });
    updated += 1;
  }
  return [legacy.length, updated];
}

async function moveProvisions(
  collection: Collection<Document>,
  dryRun: boolean
): Promise<[number, number]> {
  const filter = { "provisions.targetStrategyId": LEGACY_METHOD };
  const scanned = await collection.countDocuments(filter);
  if (dryRun) return [scanned, 0];
  const res = await collection.updateMany(
    filter,
    { $set: { "provisions.$[p].targetStrategyId": WIND } },
    { arrayFilters: [{ "p.targetStrategyId": LEGACY_METHOD }] }
  );
  return [scanned, res.modifiedCount];
}

export const migration: Migration = {
  id: "2026-11-16-split-renewables-power-method",
  description: "Move stored references to the retired renewables power method onto wind and solar.",
  idempotent: true,
  async execute(db: Db, ctx: MigrationContext): Promise<MigrationResult> {
    const parts: Array<[string, [number, number]]> = [
      ["sectors", await moveSectors(db, ctx.dryRun)],
      ["subsidies", await moveSubsidies(db, ctx.dryRun)],
      ["bills", await moveProvisions(billsCollection<Document>(db), ctx.dryRun)],
      ["stateBills", await moveProvisions(stateBillsCollection<Document>(db), ctx.dryRun)],
    ];
    return {
      documentsScanned: parts.reduce((sum, [, [scanned]]) => sum + scanned, 0),
      documentsUpdated: parts.reduce((sum, [, [, updated]]) => sum + updated, 0),
      notes: parts.map(
        ([name, [scanned, updated]]) => `${name}: ${scanned} found, ${updated} written`
      ),
    };
  },
};
