/**
 * Stamps the earning character's name on award rows written before awards
 * stored it, so each award keeps that name after the character is retired or
 * replaced. Only rows whose character still exists are filled; rows whose
 * character is gone stay blank because the name was never recorded.
 * Existing names are never changed. Idempotent.
 *
 * Hosted production runs no startup migrations, so run it once by hand:
 *   npx tsx <this script> --dry-run
 *   npx tsx <this script> --apply
 */
import type { AnyBulkWriteOperation, Db, Document, ObjectId } from "mongodb";
import { connectDb, closeDb } from "../utils/db";
import { characterAchievementsCollection } from "../../src/lib/db/repositories/characterAchievements";
import { charactersCollection } from "../../src/lib/db/repositories/characters";
import { normalizeEarnedAsName } from "../../src/lib/achievements/earnedAs";

export interface NameBackfillRow {
  _id: ObjectId;
  characterId?: ObjectId | null;
  characterName?: string | null;
}

export interface NameBackfillUpdate {
  rowId: ObjectId;
  characterName: string;
}

export interface NameBackfillReport {
  mode: "dry-run" | "applied";
  rowsWithoutName: number;
  rowsFilled: number;
  rowsCharacterGone: number;
  rowsWithoutCharacter: number;
}

const BATCH_SIZE = 1000;

/**
 * Rows that lack a stored name; a blank string counts as missing. `null` in
 * $in also matches rows with no name field at all.
 */
export const MISSING_NAME_FILTER = { characterName: { $in: [null, ""] } };

/** Pure: which rows get which name, given the live character names by id. */
export function planCharacterNameBackfill(
  rows: readonly NameBackfillRow[],
  namesById: ReadonlyMap<string, string>
): {
  updates: NameBackfillUpdate[];
  characterGone: number;
  withoutCharacter: number;
} {
  const updates: NameBackfillUpdate[] = [];
  let characterGone = 0;
  let withoutCharacter = 0;
  for (const row of rows) {
    if (normalizeEarnedAsName(row.characterName)) continue;
    if (!row.characterId) {
      withoutCharacter++;
      continue;
    }
    const name = namesById.get(row.characterId.toString());
    if (!name) {
      characterGone++;
      continue;
    }
    updates.push({ rowId: row._id, characterName: name });
  }
  return { updates, characterGone, withoutCharacter };
}

export async function backfillAchievementCharacterNames(
  db: Db,
  options: { apply: boolean }
): Promise<NameBackfillReport> {
  const rows = await characterAchievementsCollection<NameBackfillRow>(db)
    .find(MISSING_NAME_FILTER, { projection: { _id: 1, characterId: 1, characterName: 1 } })
    .toArray();
  const characterIds = new Map<string, ObjectId>();
  for (const row of rows) {
    if (row.characterId) characterIds.set(row.characterId.toString(), row.characterId);
  }
  const namesById = new Map<string, string>();
  const ids = [...characterIds.values()];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const characters = await charactersCollection<{ _id: ObjectId; name?: string }>(db)
      .find({ _id: { $in: ids.slice(i, i + BATCH_SIZE) } }, { projection: { _id: 1, name: 1 } })
      .toArray();
    for (const character of characters) {
      const name = normalizeEarnedAsName(character.name);
      if (name) namesById.set(character._id.toString(), name);
    }
  }

  const plan = planCharacterNameBackfill(rows, namesById);
  let filled = 0;
  if (options.apply) {
    for (let i = 0; i < plan.updates.length; i += BATCH_SIZE) {
      const writes: AnyBulkWriteOperation<Document>[] = plan.updates
        .slice(i, i + BATCH_SIZE)
        .map((update) => ({
          updateOne: {
            // Never overwrite a name written since the read above.
            filter: { _id: update.rowId, ...MISSING_NAME_FILTER },
            update: { $set: { characterName: update.characterName } },
          },
        }));
      const result = await characterAchievementsCollection<Document>(db).bulkWrite(writes, {
        ordered: false,
      });
      filled += result.modifiedCount;
    }
  }
  return {
    mode: options.apply ? "applied" : "dry-run",
    rowsWithoutName: rows.length,
    rowsFilled: options.apply ? filled : plan.updates.length,
    rowsCharacterGone: plan.characterGone,
    rowsWithoutCharacter: plan.withoutCharacter,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  if (apply && dryRun) throw new Error("Pass either --apply or --dry-run, not both");
  if (!apply && !dryRun) throw new Error("Pass --dry-run to preview or --apply to write");
  const db = await connectDb();
  try {
    const report = await backfillAchievementCharacterNames(db, { apply });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await closeDb();
  }
}

if (process.argv[1]?.endsWith("2026-11-27-backfill-achievement-character-names.ts")) {
  main().catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
}
