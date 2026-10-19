import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
const INDEXES: IndexPlan[] = [
  {
    // orgRegLedger has ONLY the _id index while holding 1M+ docs and growing
    // every turn (regDriftDecay insertMany + build-org/nppBuildOrg inserts).
    // getStateRegLedger.ts's headline sparkline query —
    //   find({ countryId, stateId, partyId, metric: "reg" }).sort({ turn: -1 }).limit(24)
    // — runs on every /country/*/region/* page load and was a full collection
    // scan + in-memory sort (GlitchTip slow-query evidence: 4.5s finds).
    // Equality fields first, sort key last; the (countryId, stateId) prefix
    // also covers the region-scoped deletes in evacuateRegionPolitics.ts /
    // splitParties.ts.
    collection: "orgRegLedger",
    keys: { countryId: 1, stateId: 1, partyId: 1, metric: 1, turn: -1 },
    options: { name: "reg_ledger_lookup", background: true },
  },
];

export const migration: Migration = {
  id: "2026-07-10-orgregledger-index",
  description:
    "Compound orgRegLedger index (countryId, stateId, partyId, metric, turn desc) for the region-page registration-ledger sparkline (1M-doc collscan).",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
