import { getAuthUserWithCharacter } from "@/lib/auth";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { getActionArtEra, getActionImage } from "@/lib/images/actionImages";
import { getDb } from "@/lib/mongodb";
import ActionsClient, { type InitialActionsHero } from "./ActionsClient";

async function loadInitialHero(): Promise<InitialActionsHero | null> {
  const [user, world] = await Promise.all([
    getAuthUserWithCharacter(),
    getDb().then((db) =>
      gameStateCollection(db).findOne(
        { _id: "current" },
        { projection: { preset: 1, currentYear: 1 } }
      )
    ),
  ]);
  if (!user?.character || !world) return null;
  const era = getActionArtEra(world.currentYear ?? null, world.preset ?? DEFAULT_SEED_PRESET);
  return {
    imageUrl: getActionImage("hero", { era, countryId: user.character.countryId }),
    eraLabel: String(world.currentYear ?? era),
    era,
    countryId: user.character.countryId,
    viewMode: user.actionsViewMode,
  };
}

export default async function ActionsPage() {
  const initialHero = await loadInitialHero().catch(() => null);
  return <ActionsClient initialHero={initialHero} />;
}
