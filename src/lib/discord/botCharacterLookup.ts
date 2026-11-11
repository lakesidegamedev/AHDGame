import { ObjectId, type Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { escapeRegex } from "@/lib/utils/escapeRegex";
import type { Character, User } from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";

export type BotCharacterLookup =
  { ok: false; response: Response } | { ok: true; db: Db; character: Character | null };

/** Resolve the character a bot request names by `characterId`, `discordId` or `name`. */
export async function lookupBotCharacter(request: Request): Promise<BotCharacterLookup> {
  const url = new URL(request.url);
  const characterId = url.searchParams.get("characterId");
  const discordId = url.searchParams.get("discordId");
  const name = url.searchParams.get("name");

  if (!characterId && !discordId && !name) {
    return {
      ok: false,
      response: errorResponse(400, "Must provide characterId, discordId, or name"),
    };
  }

  const db = await getDb();

  let character: Character | null = null;

  if (characterId && ObjectId.isValid(characterId)) {
    character = await charactersCollection(db).findOne({ _id: new ObjectId(characterId) });
  } else if (discordId) {
    const user = await db.collection<User>("users").findOne({ discordId });
    if (user) {
      character = await charactersCollection(db).findOne({ userId: user._id });
    }
  } else if (name) {
    character = await charactersCollection(db).findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    });
  }

  return { ok: true, db, character };
}
