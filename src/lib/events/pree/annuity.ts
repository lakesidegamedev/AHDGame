import type { Db } from "mongodb";
import { charactersCollection } from "@/lib/db/repositories/characters";

/** Credit one turn of lottery annuity PI and decrement the counter. */
export async function processLotteryAnnuities(db: Db): Promise<number> {
  const chars = await charactersCollection(db)
    .find({ "preeLotteryAnnuity.turnsRemaining": { $gt: 0 } })
    .toArray();

  let processed = 0;
  for (const character of chars) {
    const annuity = character.preeLotteryAnnuity;
    if (!annuity || annuity.turnsRemaining <= 0) {
      continue;
    }
    await charactersCollection(db).updateOne(
      { _id: character._id },
      {
        $inc: { politicalInfluence: annuity.piPerTurn },
        $set: {
          preeLotteryAnnuity: {
            piPerTurn: annuity.piPerTurn,
            turnsRemaining: annuity.turnsRemaining - 1,
          },
          updatedAt: new Date(),
        },
      }
    );
    processed++;
  }
  return processed;
}
