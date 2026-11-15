import type { Migration } from "../types";
import { migration as indexFundSeed } from "./2026-06-01-index-fund-seed";

/**
 * Re-run the idempotent index-fund definition upsert now that Nigeria has a
 * stock exchange (NGX), adding the two new NGX broad funds (ng_top_25,
 * ng_top_50) on databases that already seeded. Existing fund documents are
 * updated in place.
 */
export const migration: Migration = {
  id: "2026-07-04-ngx-index-fund-seed",
  description: "Upsert index-fund definitions again to add the NGX broad funds for Nigeria.",
  idempotent: true,
  execute: (db, ctx) => indexFundSeed.execute(db, ctx),
};
