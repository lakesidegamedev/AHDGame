import { gameStateCollection } from "@/lib/db/repositories/gameState";
/** Initialize resident population stocks before enabling Canadian demographic writers. */
import type { Migration } from "../types";
import { seedCountyPopulations } from "@/lib/counties/seed";
import { countiesCollection } from "@/lib/db/repositories/counties";
import type { Document } from "mongodb";
import { demographicFlowReceiptsCollection } from "@/lib/db/repositories/demographicFlowReceipts";
export const migration: Migration = {
  id: "2026-11-14-canadian-census-divisions",
  description:
    "Initialize Canadian census-division stocks without changing regional totals. Pause turns before migration.",
  idempotent: true,
  execute: async (db, ctx) => {
    const state = await gameStateCollection(db).findOne(
      { _id: "current" },
      { projection: { isActive: 1, isProcessing: 1 } }
    );
    if (!ctx.dryRun && (state?.isActive || state?.isProcessing))
      throw new Error("Pause turns before initializing Canadian subdivisions");
    const pending = await demographicFlowReceiptsCollection<Document>(db).countDocuments({
      status: "ready",
    });
    if (pending)
      throw new Error("Finish pending demographic receipts before initializing subdivisions");
    const count = await seedCountyPopulations(db, { apply: !ctx.dryRun, countryIds: ["CA"] });
    if (!ctx.dryRun)
      await countiesCollection<Document>(db).createIndex(
        { countryId: 1, stateId: 1 },
        { name: "counties_country_state" }
      );
    return {
      documentsScanned: count,
      notes: [
        ctx.dryRun
          ? "Would initialize Canadian subdivision stocks; no writes"
          : "Canadian subdivision stocks initialized; regional totals preserved",
      ],
    };
  },
};
