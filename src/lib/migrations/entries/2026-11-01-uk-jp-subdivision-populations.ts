/** Initialize resident population stocks before enabling UK/JP demographic writers. */
import type { Migration } from "../types";
import { seedCountyPopulations } from "@/lib/counties/seed";
export const migration: Migration = {
  id: "2026-11-01-uk-jp-subdivision-populations",
  description:
    "Initialize UK constituency and JP prefecture stocks without changing regional totals. Pause turns before migration.",
  idempotent: true,
  execute: async (db, ctx) => {
    const pending = await db
      .collection("demographicFlowReceipts")
      .countDocuments({ status: "ready" });
    if (pending)
      throw new Error("Finish pending demographic receipts before initializing subdivisions");
    const count = await seedCountyPopulations(db, { apply: !ctx.dryRun, countryIds: ["UK", "JP"] });
    if (!ctx.dryRun)
      await db
        .collection("counties")
        .createIndex({ countryId: 1, stateId: 1 }, { name: "counties_country_state" });
    return {
      documentsScanned: count,
      notes: [
        ctx.dryRun
          ? "Would initialize UK/JP subdivision stocks; no writes"
          : "UK/JP subdivision stocks initialized; regional totals preserved",
      ],
    };
  },
};
