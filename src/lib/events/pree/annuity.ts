import type { Db, AnyBulkWriteOperation } from "mongodb";
import type { Character } from "@/lib/db/types/character";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { withTurnValueSettlement } from "@/lib/turn/withTurnValueSettlement";

/** Credit the original turn's lottery influence installment once. */
export async function processLotteryAnnuities(db: Db, currentTurn: number): Promise<number> {
  return withTurnValueSettlement(db, "lottery-annuity", currentTurn, async (db) => {
    const chars = await charactersCollection(db)
      .find(
        { "preeLotteryAnnuity.turnsRemaining": { $gt: 0 } },
        { projection: { preeLotteryAnnuity: 1 } }
      )
      .toArray();
    const writes: AnyBulkWriteOperation<Character>[] = [];
    for (const character of chars) {
      const annuity = character.preeLotteryAnnuity;
      if (!annuity || annuity.turnsRemaining <= 0) continue;
      writes.push({
        updateOne: {
          filter: { _id: character._id, preeLotteryAnnuity: annuity },
          update: {
            $inc: { politicalInfluence: annuity.piPerTurn },
            $set: {
              preeLotteryAnnuity: { ...annuity, turnsRemaining: annuity.turnsRemaining - 1 },
              updatedAt: new Date(),
            },
          },
        },
      });
    }
    return writes.length ? (await charactersCollection(db).bulkWrite(writes)).modifiedCount : 0;
  });
}
