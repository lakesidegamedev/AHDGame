import type { Migration } from "../types";
import { seedCountyPopulations } from "@/lib/counties/seed";
import { countiesCollection } from "@/lib/db/repositories/counties";
import type { Document } from "mongodb";
import { demographicFlowReceiptsCollection } from "@/lib/db/repositories/demographicFlowReceipts";
export const migration: Migration = {
  id: "2026-10-30-county-populations",
  description:
    "Initialize county stocks without changing state population totals. Pause turns before migration.",
  idempotent: true,
  execute: async (db, ctx) => {
    const pending = await demographicFlowReceiptsCollection<Document>(db).countDocuments({
      status: "ready",
    });
    if (pending)
      throw new Error("Finish pending demographic receipts before initializing counties");
    const count = await seedCountyPopulations(db, { apply: !ctx.dryRun, countryIds: ["US"] });
    if (!ctx.dryRun)
      await countiesCollection<Document>(db).createIndex(
        { countryId: 1, stateId: 1 },
        { name: "counties_country_state" }
      );
    return {
      documentsScanned: count,
      notes: [
        ctx.dryRun
          ? "Would initialize county stocks; no writes"
          : "County stocks initialized and state totals preserved",
      ],
    };
  },
};
