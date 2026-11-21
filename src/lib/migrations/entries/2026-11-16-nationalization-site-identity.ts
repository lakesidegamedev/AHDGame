/** State acquisitions keep physical sites separate; absent site keys retain private uniqueness. */
import type { Db } from "mongodb";
import type { Migration } from "../types";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

export async function ensureNationalizationSiteIndex(db: Db): Promise<void> {
  const collection = corporateSectorsCollection(db);
  await collection.createIndex(
    { corporationId: 1, stateId: 1, sectorType: 1, nationalizationSiteKey: 1 },
    { name: "corporateSectors_corporation_state_type_site_unique", unique: true }
  );
  const indexes = await collection.indexes();
  for (const index of indexes) {
    if (
      index.unique &&
      index.name &&
      JSON.stringify(index.key) === JSON.stringify({ corporationId: 1, stateId: 1, sectorType: 1 })
    )
      await collection.dropIndex(index.name);
  }
}

export const migration: Migration = {
  id: "2026-11-16-nationalization-site-identity",
  description: "Preserve acquired physical sites without relaxing private-sector identity",
  idempotent: true,
  async execute(db, { dryRun }) {
    if (!dryRun) await ensureNationalizationSiteIndex(db);
    return {
      documentsScanned: 0,
      documentsUpdated: 0,
      notes: [
        "Installs the site-aware unique index before removing the older guard; no assets or balances change.",
      ],
    };
  },
};
