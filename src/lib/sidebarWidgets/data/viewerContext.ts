import { ObjectId, type Db } from "mongodb";
import type { User } from "@/lib/db/types/user";
import type { Character } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getGameStateCore, type GameStateCore } from "@/lib/gameState";

/** The few character fields the role widgets read. */
export type ViewerCharacter = Pick<
  Character,
  "_id" | "countryId" | "homeState" | "currentOffice" | "party"
> & { countryId: CountryId };

export type ViewerUser = Pick<
  User,
  "_id" | "activeCharacterId" | "activeCharacterType" | "notificationPreferences"
>;

interface Memo {
  user?: Promise<ViewerUser | null>;
  character?: Promise<ViewerCharacter | null>;
  gameState?: Promise<GameStateCore | null>;
}

// One request asks for several widgets at once; they share these reads.
const memos = new WeakMap<object, Memo>();

function memo(viewer: object): Memo {
  let entry = memos.get(viewer);
  if (!entry) {
    entry = {};
    memos.set(viewer, entry);
  }
  return entry;
}

export function loadViewerUser(db: Db, viewer: { userId: string }): Promise<ViewerUser | null> {
  const entry = memo(viewer);
  entry.user ??= db.collection<User>("users").findOne(
    { _id: new ObjectId(viewer.userId) },
    {
      projection: {
        activeCharacterId: 1,
        activeCharacterType: 1,
        notificationPreferences: 1,
      },
    }
  );
  return entry.user;
}

/**
 * The viewer's active political character, or null for imperial play or no
 * character. Memoised per viewer object, so pass the same object to every loader.
 */
export function loadViewerCharacter(
  db: Db,
  viewer: { userId: string }
): Promise<ViewerCharacter | null> {
  const entry = memo(viewer);
  entry.character ??= (async () => {
    const user = await loadViewerUser(db, viewer);
    if (!user?.activeCharacterId || user.activeCharacterType === "imperial") return null;
    const character = await db
      .collection<Character>("characters")
      .findOne(
        { _id: user.activeCharacterId },
        { projection: { countryId: 1, homeState: 1, currentOffice: 1, party: 1 } }
      );
    return character?.countryId ? (character as ViewerCharacter) : null;
  })();
  return entry.character;
}

export function loadWidgetGameState(db: Db, viewer: object): Promise<GameStateCore | null> {
  const entry = memo(viewer);
  entry.gameState ??= getGameStateCore(db);
  return entry.gameState;
}

/** Turns from now until `endTurn`, never negative; null when unknown. */
export function turnsUntil(endTurn: number | undefined | null, currentTurn: number | undefined) {
  if (typeof endTurn !== "number" || typeof currentTurn !== "number") return null;
  return Math.max(0, endTurn - currentTurn);
}
