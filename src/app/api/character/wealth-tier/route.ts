import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { withNoStore } from "@/lib/api/withNoStore";
import { getDb } from "@/lib/mongodb";
import { requireHumanSession } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import type { Character, User } from "@/lib/db/types";
import { loadCampaignCurrencyRates } from "@/lib/campaigns/campaignCurrency";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import {
  currentWealthTier,
  wealthTierOptions,
  wealthTierRepickDelta,
} from "@/lib/character/wealthTierRepick";

const repickSchema = z.object({
  wealth: z.enum(["low", "middle", "high"]),
});

/** Resolve the requesting user's active character. */
async function loadActiveCharacter(userId: string) {
  const db = await getDb();
  const userDoc = await db
    .collection<User>("users")
    .findOne({ _id: new ObjectId(userId) }, { projection: { activeCharacterId: 1 } });
  const query = userDoc?.activeCharacterId
    ? { _id: userDoc.activeCharacterId, userId: new ObjectId(userId) }
    : { userId: new ObjectId(userId) };
  const character = await db.collection<Character>("characters").findOne(query);
  return { db, character };
}

// GET /api/character/wealth-tier — The active character's current tier and the
// tier choices priced in their home currency, for the one-time re-pick modal.
// Auth: requireHumanSession. Errors: 401, 403, 404, 409.
async function handleGET(request: Request) {
  try {
    const auth = await requireHumanSession(request);
    if (!auth.ok) return auth.response;

    const { db, character } = await loadActiveCharacter(auth.user.userId);
    if (!character) return errorResponse(404, "Character not found");
    if (!character.wealthTierRepickPending)
      return errorResponse(409, "Your wealth background is already set.");

    const [preset, rates] = await Promise.all([
      getGameStatePresetOrDefault(db),
      loadCampaignCurrencyRates(db),
    ]);
    return NextResponse.json({
      current: currentWealthTier(character),
      options: wealthTierOptions(character.countryId, preset, rates),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);

// POST /api/character/wealth-tier — Commits the one-time wealth background
// re-pick. Personal cash moves by the difference between the new tier and the
// old one, never below zero.
// Auth: requireHumanSession. Errors: 400, 401, 404, 409, 429.
export async function POST(request: Request) {
  try {
    const auth = await requireHumanSession(request);
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(`api/character/wealth-tier:${auth.user.userId}`, 10, 60000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, repickSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const { db, character } = await loadActiveCharacter(auth.user.userId);
    if (!character) return errorResponse(404, "Character not found");
    if (!character.wealthTierRepickPending)
      return errorResponse(409, "Your wealth background is already set.");

    const [preset, rates, forexEnabled] = await Promise.all([
      getGameStatePresetOrDefault(db),
      loadCampaignCurrencyRates(db),
      isForexEnabled(),
    ]);
    const nextTier = parsed.data.wealth;
    const delta = wealthTierRepickDelta({
      countryId: character.countryId,
      currentTier: currentWealthTier(character),
      nextTier,
      preset,
      rates,
    });

    const clampedAdd = (path: string, amount: number) => ({
      $max: [0, { $add: [{ $ifNull: [`$${path}`, 0] }, amount] }],
    });
    const personalPath = `currencyBalances.personal.${delta.currency}`;
    // Atomic guard on the pending flag: a double submit applies once.
    const result = await db
      .collection<Character>("characters")
      .updateOne({ _id: character._id, wealthTierRepickPending: true }, [
        {
          $set: {
            cashOnHand: clampedAdd("cashOnHand", delta.anchorDelta),
            ...(forexEnabled
              ? { [personalPath]: clampedAdd(personalPath, delta.personalLocalDelta) }
              : {}),
            initialIncomeTier: nextTier,
            incomeTier: nextTier,
            "demographics.wealth": nextTier,
            wealthTierRepickPending: false,
            wealthTierRepickedAt: "$$NOW",
            updatedAt: "$$NOW",
          },
        },
      ]);
    if (result.matchedCount === 0)
      return errorResponse(409, "Your wealth background is already set.");

    return NextResponse.json({ success: true, wealth: nextTier });
  } catch (error) {
    return handleRouteError(error);
  }
}
