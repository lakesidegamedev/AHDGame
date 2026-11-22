import type { ObjectId } from "mongodb";
import type { CollectionSource } from "@/lib/db/repositories/source";
import { charactersCollection } from "@/lib/db/repositories/characters";

/**
 * True when the account already had an older character. Facts such as the
 * join date and earned achievements belong to the character in that case,
 * not to the account's history.
 */
export async function isAdditionalCharacter(
  db: CollectionSource,
  character: { _id: ObjectId; userId: ObjectId; createdAt: Date }
): Promise<boolean> {
  const older = await charactersCollection(db).findOne(
    {
      userId: character.userId,
      _id: { $ne: character._id },
      createdAt: { $lt: character.createdAt },
    },
    { projection: { _id: 1 } }
  );
  return older !== null;
}
