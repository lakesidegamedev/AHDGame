import type { AnyBulkWriteOperation, Db, Document } from "mongodb";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { demographicDefaultsCollection } from "@/lib/db/repositories/demographicDefaults";
import {
  convertGroupDrift,
  type GroupBucketTable,
  type GroupDriftDoc,
} from "@/lib/demographics/legacyGroupDrift/rules";

/**
 * Regions saved by older builds carry their voter lean drift on group rows,
 * which this build does not read; without the move every region's leans snap
 * back to the seeded census on deploy. Each region's drift is added to its
 * census bucket overlay and the group rows are set back to their seeded
 * values in one write, so a second run finds no drift and the older build
 * reads the same electorate from the converted document.
 */

const BATCH = 500;

interface LiveRegionDoc extends GroupDriftDoc, Document {
  _id: string;
  countryId?: string;
}

interface SeededRegionDoc extends GroupDriftDoc, Document {
  _id: string;
}

export const migration: Migration = {
  id: "2026-11-11-region-group-drift-to-buckets",
  description:
    "Move each region's saved voter group lean drift onto its census bucket overlay and reset the group rows to their seeded values.",
  idempotent: true,
  async execute(db: Db, ctx: MigrationContext): Promise<MigrationResult> {
    const live = stateDemographicsCollection<LiveRegionDoc>(db);
    const seeded = demographicDefaultsCollection<SeededRegionDoc>(db);
    const filter = { groups: { $exists: true, $type: "object" as const } };
    const cursor = live.find(filter, {
      projection: { _id: 1, countryId: 1, groups: 1, layer1PositionOverrides: 1 },
    });

    // The seed tables are only loaded when a saved world actually has group rows.
    let resolveTable: ((countryId: string | undefined) => GroupBucketTable) | null = null;
    let scanned = 0;
    let converted = 0;
    let written = 0;
    const unmapped = new Set<string>();
    let batch: LiveRegionDoc[] = [];

    const flush = async () => {
      if (batch.length === 0) return;
      resolveTable ??= (
        await import("@/lib/demographics/legacyGroupDrift/countryTables")
      ).createGroupTableResolver();
      const ids = batch.map((doc) => doc._id);
      const defaults = await seeded
        .find({ _id: { $in: ids } }, { projection: { _id: 1, groups: 1 } })
        .toArray();
      const byId = new Map(defaults.map((doc) => [doc._id, doc]));
      const ops: AnyBulkWriteOperation<LiveRegionDoc>[] = [];
      for (const doc of batch) {
        const conversion = convertGroupDrift(doc, byId.get(doc._id), resolveTable(doc.countryId));
        for (const id of conversion.unmapped) unmapped.add(id);
        if (Object.keys(conversion.set).length === 0) continue;
        converted += 1;
        ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: conversion.set } } });
      }
      if (ops.length > 0 && !ctx.dryRun) {
        const res = await live.bulkWrite(ops, { ordered: false });
        written += res.modifiedCount;
      }
      batch = [];
    };

    for await (const doc of cursor) {
      scanned += 1;
      batch.push(doc);
      if (batch.length >= BATCH) await flush();
    }
    await flush();

    const notes = [
      ctx.dryRun
        ? `stateDemographics: ${converted} of ${scanned} regions carry drift to move`
        : `stateDemographics: moved drift on ${written} of ${scanned} regions`,
    ];
    if (unmapped.size > 0) {
      notes.push(`no bucket mapping, drift dropped: ${[...unmapped].sort().join(", ")}`);
    }
    return { documentsScanned: scanned, documentsUpdated: ctx.dryRun ? 0 : written, notes };
  },
};
