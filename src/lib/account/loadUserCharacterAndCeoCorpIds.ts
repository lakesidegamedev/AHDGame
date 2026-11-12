import type { Db, ObjectId } from "mongodb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";

export interface UserCharacterAndCeoCorpIds {
  characterIds: ObjectId[];
  ceoCorpIds: ObjectId[];
}

export async function loadUserCharacterAndCeoCorpIds(
  db: Db,
  userId: ObjectId
): Promise<UserCharacterAndCeoCorpIds> {
  const characters = await charactersCollection(db)
    .find({ userId }, { projection: { _id: 1 } })
    .toArray();
  const characterIds = characters.map((character) => character._id);

  if (characterIds.length === 0) {
    return { characterIds, ceoCorpIds: [] };
  }

  const ceoCorps = await corporationsCollection(db)
    .find({ ceoId: { $in: characterIds } }, { projection: { _id: 1 } })
    .toArray();

  return {
    characterIds,
    ceoCorpIds: ceoCorps.map((corp) => corp._id),
  };
}
