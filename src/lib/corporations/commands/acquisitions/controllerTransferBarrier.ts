import type { Db } from "mongodb";
import type { Character, Corporation } from "@/lib/db/types";
import { getNewCharacterTransferBarrier } from "@/lib/character/newCharacterTransferBarrier";

/** API command guard, shared by direct merges and subsidiary control transfers. */
export async function controllerTransferBarrierError(
  db: Db,
  corp: Corporation,
  currentTurn: number,
  now: Date
): Promise<string | null> {
  if (corp.ceoType === "npp" && !corp.caretakerCeo) return null;
  const controller = await db
    .collection<Character>(corp.ceoType === "imperial" ? "imperialCharacters" : "characters")
    .findOne(
      corp.ceoType === "npp" && corp.caretakerCeo && corp.userId
        ? { userId: corp.userId }
        : { _id: corp.ceoId },
      { projection: { createdTurn: 1, createdAt: 1 } }
    );
  if (!controller) return null;
  const barrier = getNewCharacterTransferBarrier(controller, currentTurn, now.getTime());
  return barrier.blocked
    ? `New characters cannot transfer corporate ownership or funds during their first 48 turns. Try again in ${barrier.remainingTurns} turn(s).`
    : null;
}
