import type { Migration } from "../types";

/**
 * Retired. It once copied lean effects onto the old Japanese law types, which
 * Japan's one law book replaced. The id stays so worlds that already applied it
 * keep a consistent history; a world without those types has nothing to update.
 */
export const migration: Migration = {
  id: "2026-11-09-jp-law-lean-effects",
  description: "Retired: the old Japanese law types no longer exist.",
  idempotent: true,
  execute: async () => ({
    documentsScanned: 0,
    documentsUpdated: 0,
    notes: ["Retired migration: the old Japanese law types are gone, nothing to update."],
  }),
};
