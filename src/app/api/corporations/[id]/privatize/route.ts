import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { requireCorporationActionsEnabled } from "@/lib/api/requireCorporationActions";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { resolveCorporation, requireCeo } from "@/lib/api/corporations/resolveQuery";
import { getGameState } from "@/lib/gameState";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { openPrivatizationVote } from "@/lib/corporations/commands/privatization/openPrivatizationVote";
import {
  logWireEvent,
  wireHeadlineCorpPrivatized,
  wireHeadlineCorpPrivatizationVoteOpened,
} from "@/lib/wireEvent";
import { notifyVoteEventRaw } from "@/lib/corporations/votes/voteNotifications";
import { charactersCollection } from "@/lib/db/repositories/characters";
import {
  privatizationFunding,
  quotePrivatizationBuyout,
} from "@/lib/corporations/commands/privatization/privatizationQuote";
import { getHomeCurrency, getPersonalBalance } from "@/lib/currency/characterFunds";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/corporations/[id]/privatize
 * Open a 24-turn privatization buyout vote. CEO only, requires >75% ownership,
 * reserves worst-case payout from CEO personal funds at vote-open time.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/corporations/[id]/privatize:${auth.user.userId}`,
      5,
      60_000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { id } = await params;
    const db = await getDb();
    const corpGuard = await requireCorporationActionsEnabled(db);
    if (corpGuard) return corpGuard;

    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    const ceoCheck = requireCeo(corporation, auth.user);
    if (ceoCheck) return ceoCheck;

    const character = await charactersCollection(db).findOne({ _id: corporation.ceoId });
    if (!character) {
      return errorResponse(404, "CEO character not found");
    }

    const gameState = await getGameState();
    const currentTurn = gameState?.currentTurn ?? 0;
    const forexEnabled = await isForexEnabled();

    const result = await openPrivatizationVote({
      db,
      corporation,
      character,
      currentTurn,
      forexEnabled,
    });
    if (!result.ok) {
      return errorResponse(result.status, result.error);
    }

    if (result.immediate) {
      logWireEvent("corporation_privatized", wireHeadlineCorpPrivatized(corporation.name), {
        href: `/corporation/${corporation.sequentialId ?? corporation._id}`,
      });
      return NextResponse.json({ privatized: true, immediate: true });
    }

    logWireEvent(
      "corporation_privatization_vote_opened",
      wireHeadlineCorpPrivatizationVoteOpened(corporation.name, result.lockedBuyoutPrice),
      { href: `/corporation/${corporation.sequentialId ?? corporation._id}` }
    );
    void notifyVoteEventRaw({
      db,
      corporationId: corporation._id,
      voteId: result.voteId,
      corpName: corporation.name,
      summary: "take the corporation private (buyout)",
      notificationType: "corp_vote_opened",
    });

    return NextResponse.json({
      voteId: result.voteId.toString(),
      lockedBuyoutPrice: result.lockedBuyoutPrice,
      totalReservedCash: result.totalReservedCash,
      bankNavFloorApplied: result.bankNavFloorApplied,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * GET /api/corporations/[id]/privatize
 * The buyout quote the next vote would lock, plus whether the CEO's personal
 * cash covers the reservation. CEO only.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const db = await getDb();
    const resolved = await resolveCorporation(db, id);
    if (!resolved.ok) return resolved.response;
    const { corporation } = resolved;

    const ceoCheck = requireCeo(corporation, auth.user);
    if (ceoCheck) return ceoCheck;

    const character = await charactersCollection(db).findOne({ _id: corporation.ceoId });
    if (!character) return errorResponse(404, "CEO character not found");

    const ceoShares =
      corporation.shareholders.find(
        (s) => s.characterId?.toString() === corporation.ceoId.toString()
      )?.shares ?? 0;
    const forexEnabled = await isForexEnabled();
    const quote = await quotePrivatizationBuyout(db, corporation, ceoShares);
    const ceoCurrency = getHomeCurrency(character);
    const crossCurrency = forexEnabled && quote.currency !== ceoCurrency;
    const personalCash = getPersonalBalance(
      character,
      quote.currency as Parameters<typeof getPersonalBalance>[1],
      forexEnabled
    );
    const funding = privatizationFunding(quote.totalReservedCash, personalCash);

    return NextResponse.json({
      ...quote,
      personalCash,
      affordable: funding.affordable && !crossCurrency,
      shortfall: funding.shortfall,
      crossCurrency,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
