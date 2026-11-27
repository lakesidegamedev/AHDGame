/**
 * Look up the names to stamp on new award rows, so each award remembers the
 * character that earned it even after that character is gone.
 */
import type { Db, ObjectId } from "mongodb";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { normalizeEarnedAsName } from "./earnedAs";

/** Current names for the given character ids, keyed by id string. Never throws. */
export async function loadCharacterNames(
  db: Db,
  characterIds: ReadonlyArray<ObjectId | null | undefined>
): Promise<Map<string, string>> {
  const unique = new Map<string, ObjectId>();
  for (const id of characterIds) if (id) unique.set(id.toString(), id);
  if (unique.size === 0) return new Map();
  try {
    const rows = await charactersCollection<{ _id: ObjectId; name?: string }>(db)
      .find({ _id: { $in: [...unique.values()] } }, { projection: { _id: 1, name: 1 } })
      .toArray();
    const names = new Map<string, string>();
    for (const row of rows) {
      const name = normalizeEarnedAsName(row.name);
      if (name) names.set(row._id.toString(), name);
    }
    return names;
  } catch (error) {
    console.error("[achievements] loadCharacterNames error:", error);
    return new Map();
  }
}

/** The award row with its earning character's name, when one is known. */
export function withCharacterName<T extends { characterId?: ObjectId | null }>(
  doc: T,
  names: ReadonlyMap<string, string>
): T & { characterName?: string } {
  const name = doc.characterId ? names.get(doc.characterId.toString()) : undefined;
  return name ? { ...doc, characterName: name } : doc;
}
