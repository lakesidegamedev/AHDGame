import type { Db } from "mongodb";
import { getCollectionsByCategory } from "./seedManifest";

/**
 * Reference collections a reference rebuild keeps, and why. Every other
 * reference collection is emptied before bootstrap.
 */
export const REFERENCE_REBUILD_KEPT_COLLECTIONS: Readonly<Record<string, string>> = Object.freeze({
  gameConfig:
    "Operator state no seeder restores (maintenance seal, webhooks, gates, the reset run record). " +
    "Teardown resets its per-world keys explicitly.",
  politicalParties:
    "Default parties keep their identity and sequential ids, which archived careers and party " +
    "counters reference. Country seeders replace their own rows and finalize removes the rest.",
  achievements: "Seeded only into an empty collection; character achievements reference its ids.",
});

/**
 * Reference collections a reset empties before a reference rebuild
 * (`resetReference: true`), so the bootstrap that follows writes them into an
 * empty collection exactly as it does on a brand-new database: replaced, never
 * merged.
 *
 * Seeders upsert keyed on the NEW roster, and many `$set` only the fields they
 * author. An upsert cannot remove a row the new world does not write, nor a
 * field the seeder no longer writes, so without this clear a reset kept old
 * regions, accreted engine state on region rows, budget sub-ledgers such as
 * the defence appropriation, and runtime channels on political boards.
 *
 * Derived from the seed manifest, so a new reference collection is cleared
 * unless it is added to {@link REFERENCE_REBUILD_KEPT_COLLECTIONS} with a
 * reason. A brand-new database starts with every one of these empty, and
 * bootstrap builds a playable world from that, so an empty start is the
 * supported baseline.
 */
export const REFERENCE_REBUILD_CLEARED_COLLECTIONS: ReadonlyArray<{
  name: string;
  seededBy: string;
}> = getCollectionsByCategory("reference")
  .filter(({ name }) => !(name in REFERENCE_REBUILD_KEPT_COLLECTIONS))
  .map(({ name, seededBy }) => ({
    name,
    seededBy: seededBy ?? "no current seeder; cleared so retired rows cannot linger",
  }));

/** Empty every collection in {@link REFERENCE_REBUILD_CLEARED_COLLECTIONS}. */
export async function clearReferenceForRebuild(db: Db): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  for (const { name } of REFERENCE_REBUILD_CLEARED_COLLECTIONS) {
    const result = await db.collection(name).deleteMany({});
    deleted[name] = result.deletedCount ?? 0;
  }
  return deleted;
}
