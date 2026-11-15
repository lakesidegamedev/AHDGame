import type { Migration } from "../types";

export const migration: Migration = {
  id: "2026-08-09-reconcile-command-economy-unowned",
  description:
    "Retired: command-economy state enterprises are created by the seed, and there are no market pools left to drain.",
  idempotent: true,
  execute: async () => ({
    documentsScanned: 0,
    notes: ["market pool collection retired; command-economy enterprises come from the seed"],
  }),
};
