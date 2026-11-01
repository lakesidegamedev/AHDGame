import { ObjectId, type Db } from "mongodb";
import type { Character, GameState } from "@/lib/db/types";
import { SINGLEPLAYER_USER_ID } from "@/lib/singleplayer";
import { loadOnboardingSignals } from "@/lib/onboarding/checklist";
import {
  deriveSingleplayerGuide,
  type SingleplayerGuide,
  type SingleplayerGuideCharacter,
} from "@/lib/singleplayerGuide";

/**
 * Load the first-game guide for the local world. Cheap for the common case: a
 * world that does not offer the guide, or whose player has closed it, costs one
 * gameState read and no further queries.
 */
export async function loadSingleplayerGuide(db: Db): Promise<SingleplayerGuide> {
  const state = await db
    .collection<GameState>("gameState")
    .findOne({ _id: "current" }, { projection: { currentTurn: 1, singleplayerConfig: 1 } });
  const config = state?.singleplayerConfig ?? null;
  if (config?.mode !== "normal" || !config.guide || config.guide.dismissedAt) {
    return deriveSingleplayerGuide({
      config,
      character: null,
      currentTurn: 0,
      hasCampaignActed: false,
      partiesAvailable: false,
    });
  }

  const character = await db.collection<Character>("characters").findOne(
    { userId: new ObjectId(SINGLEPLAYER_USER_ID), retiredAt: { $exists: false } },
    {
      projection: {
        _id: 1,
        countryId: 1,
        party: 1,
        funds: 1,
        currencyBalances: 1,
        actions: 1,
        createdTurn: 1,
        currentOffice: 1,
        careerHistory: 1,
        onboarding: 1,
      },
    }
  );

  let hasCampaignActed = false;
  let partiesAvailable = false;
  if (character) {
    const [signals, partyCount] = await Promise.all([
      loadOnboardingSignals(db, character._id),
      // The collection is "politicalParties", not "parties".
      db
        .collection("politicalParties")
        .countDocuments({ countryId: character.countryId }, { limit: 1 }),
    ]);
    hasCampaignActed = signals.hasCampaignActed;
    partiesAvailable = partyCount > 0;
  }

  const guideCharacter: SingleplayerGuideCharacter | null = character
    ? {
        countryId: character.countryId,
        party: character.party,
        currentOffice: character.currentOffice,
        careerHistory: character.careerHistory,
        onboarding: character.onboarding,
        funds: character.currencyBalances?.campaign ?? character.funds ?? 0,
        actions: character.actions ?? 0,
        createdTurn: character.createdTurn,
      }
    : null;

  return deriveSingleplayerGuide({
    config,
    character: guideCharacter,
    currentTurn: typeof state?.currentTurn === "number" ? state.currentTurn : 0,
    hasCampaignActed,
    partiesAvailable,
  });
}
