import type { Migration } from "../types";

export const migration: Migration = {
  id: "2026-08-01-backfill-unowned-headroom-units",
  description:
    "Retired: the market pool collection no longer exists, so there is nothing to backfill.",
  idempotent: true,
  execute: async () => ({
    documentsScanned: 0,
    notes: ["market pool collection retired; nothing to backfill"],
  }),
};
