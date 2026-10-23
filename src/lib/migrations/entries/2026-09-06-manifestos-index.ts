import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
const INDEXES: IndexPlan[] = [
  {
    // `manifestos` shipped with no index beyond _id. Every read is on this
    // exact triple — the point lookup behind save/lock (getManifesto) and the
    // `$in` batch behind the elections page (getManifestosForElections) — so
    // all of them were collection scans, one per contested Commons race.
    // Not unique: the upsert filter already keys on this triple, and adding a
    // uniqueness constraint to live data is a separate decision.
    collection: "manifestos",
    keys: { countryId: 1, electionId: 1, party: 1 },
    options: { name: "manifestos_country_election_party", background: true },
  },
];

export const migration: Migration = {
  id: "2026-09-06-manifestos-index",
  description:
    "Compound manifestos index (countryId, electionId, party) — the collection had only _id, so every manifesto read on the elections page was a collection scan.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
