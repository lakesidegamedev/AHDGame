import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types";
import { gameIterationId } from "./gameEventEnvelope";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { analyticsRecordsCollection } from "@/lib/db/repositories/analyticsRecords";

interface ActivationRecord {
  _id: string;
  value: number;
  startingNationId: string;
  creationPath: "character_creator";
  characterCount: number;
  claimed?: boolean;
}

/** Consent-approved creation metadata, separate from gameplay documents. */
export async function rememberCharacterActivation(
  db: Db,
  characterId: string,
  metadata: { createdTurn: number; startingNationId: string; characterCount: number }
): Promise<void> {
  try {
    const state = await gameStateCollection(db).findOne({}, { projection: { iteration: 1 } });
    const id = `character-activation:${gameIterationId(state?.iteration)}:${characterId}`;
    await analyticsRecordsCollection<ActivationRecord>(db).updateOne(
      { _id: id },
      {
        $setOnInsert: {
          value: metadata.createdTurn,
          startingNationId: metadata.startingNationId,
          creationPath: "character_creator",
          characterCount: metadata.characterCount,
        },
      },
      { upsert: true }
    );
  } catch {
    // Optional telemetry must not affect character creation.
  }
}

/** Atomic cross-browser claim. The caller verifies ownership and current consent. */
export async function claimCharacterActivation(db: Db, characterId: string) {
  try {
    const state = await gameStateCollection(db).findOne(
      {},
      {
        projection: { iteration: 1, currentTurn: 1 },
      }
    );
    const iterationId = gameIterationId(state?.iteration);
    const anchor = await analyticsRecordsCollection<ActivationRecord>(db).findOneAndUpdate(
      { _id: `character-activation:${iterationId}:${characterId}`, claimed: { $ne: true } },
      { $set: { claimed: true } },
      { returnDocument: "before" }
    );
    if (!anchor) return null;
    return {
      iteration_id: iterationId,
      turn_number: typeof state?.currentTurn === "number" ? state.currentTurn : 0,
      turns_since_character_creation: Math.max(0, (state?.currentTurn ?? 0) - anchor.value),
      starting_nation_id: anchor.startingNationId,
      creation_path: anchor.creationPath,
      character_count: anchor.characterCount,
    };
  } catch {
    return null;
  }
}
