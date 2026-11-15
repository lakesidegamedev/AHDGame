import type { Db } from "mongodb";
import {
  PRESERVED_COLLECTION_CONTRACT,
  preservedFieldResetUpdate,
} from "@/lib/admin/resetContract/rules/preservedFields";

/**
 * Apply every field contract in {@link PRESERVED_COLLECTION_CONTRACT} to the
 * surviving documents. Runs in teardown, after characters are retired or
 * deleted, so the account pointers it clears cannot be rewritten afterwards.
 *
 * One pipeline update per collection. Literal values go through `$literal` so
 * an empty object or array is stored as written rather than parsed as an
 * expression.
 */
export async function applyPreservedFieldContracts(db: Db): Promise<Record<string, number>> {
  const modified: Record<string, number> = {};
  for (const [name, rule] of Object.entries(PRESERVED_COLLECTION_CONTRACT)) {
    if (rule.kind !== "fields") continue;
    const update = preservedFieldResetUpdate(rule.fields);
    const stages: Record<string, unknown>[] = [];
    const set: Record<string, unknown> = {
      ...Object.fromEntries(
        Object.entries(update.set).map(([field, value]) => [field, { $literal: value }])
      ),
      ...update.derive,
    };
    if (Object.keys(set).length > 0) stages.push({ $set: set });
    if (update.unset.length > 0) stages.push({ $unset: update.unset });
    if (stages.length === 0) continue;
    const result = await db.collection(name).updateMany({}, stages);
    modified[name] = result.modifiedCount ?? 0;
  }
  return modified;
}
