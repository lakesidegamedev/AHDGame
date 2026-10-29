// POST /api/country/[code]/region/[id]/economy/attack-sector
// Attempt to split whole plants from a rival corporation in the same market.
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireHumanSession } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { regionUrl } from "@/lib/urls";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { Corporation, CorporateSector, State, User, ImperialCharacter } from "@/lib/db/types";
import type { GameState } from "@/lib/db/types/gameState";
import { OPERATING_SECTOR_TYPE_LABELS } from "@/lib/constants/corporations";
import { z } from "zod";
import { logWireEvent } from "@/lib/wireEvent";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { createNotification } from "@/lib/notifications";
import { logEconomicAction } from "@/lib/corporations/economicActionLog";
import { getCorpFxRate, resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { loadCommandEconomyBlockedCountries } from "@/lib/economy/queries/commandEconomyMarketGate";
import {
  attemptPlantSectorSplit,
  type SplitResolution,
} from "@/lib/corporations/commands/plantSectorSplitAttempt";
import { emitTx } from "@/lib/financialTxLog/emit";

const attackSectorSchema = z.object({ sectorId: z.string().length(24) });

interface RouteParams {
  params: Promise<{ code: string; id: string }>;
}

function auditableRandomRoll(): number {
  return randomInt(0, 1_000_000_000) / 1_000_000_000;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireHumanSession(request);
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/country/[code]/region/[id]/economy/attack-sector:${auth.user.userId}`,
      20,
      60_000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const db = await getDb();
    const gameState = await db.collection<GameState>("gameState").findOne({ _id: "current" });
    if (gameState?.corporationActionsPaused) {
      return errorResponse(403, "Corporation actions are currently paused");
    }

    if (!marketAtLeast(await getMarketSystemModeForDb(db), "plants")) {
      return errorResponse(409, "Sector splits require the plants economy.");
    }

    const { code, id: stateId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }

    const parsed = await parseJsonBody(request, attackSectorSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    if (!ObjectId.isValid(parsed.data.sectorId)) {
      return errorResponse(400, "Invalid sector ID");
    }
    const targetSectorId = new ObjectId(parsed.data.sectorId);

    const state = await db.collection<State>("states").findOne({ _id: stateId, countryId });
    if (!state) return errorResponse(404, "State not found");

    const blockedCountries = await loadCommandEconomyBlockedCountries(db, [countryId]);
    if (blockedCountries.has(countryId)) {
      return errorResponse(
        403,
        "This market is state-controlled under a command economy and cannot be privately attacked."
      );
    }

    const userDoc = await db
      .collection<User>("users")
      .findOne({ _id: new ObjectId(auth.user.userId) });
    let attacker: Corporation | null = null;
    if (userDoc?.activeCharacterType === "imperial" && userDoc.activeImperialCharacterId) {
      const imperial = await db.collection<ImperialCharacter>("imperialCharacters").findOne({
        _id: userDoc.activeImperialCharacterId,
        userId: new ObjectId(auth.user.userId),
      });
      if (imperial) {
        attacker = await db.collection<Corporation>("corporations").findOne({
          ceoId: imperial._id,
          ceoType: "imperial",
          ceoVacant: { $ne: true },
        });
      }
    } else {
      const character = await getCharacterByUserId(db, auth.user.userId);
      if (character) {
        attacker = await db
          .collection<Corporation>("corporations")
          .findOne({ ceoId: character._id, ceoVacant: { $ne: true } });
      }
    }
    if (!attacker) {
      return errorResponse(400, "You don't own a corporation");
    }

    const targetSector = await db
      .collection<CorporateSector>("corporateSectors")
      .findOne({ _id: targetSectorId, stateId });
    if (!targetSector) {
      return errorResponse(404, "Sector not found");
    }
    if (targetSector.corporationId.equals(attacker._id)) {
      return errorResponse(400, "Cannot attack your own sector");
    }

    const defender = await db
      .collection<Corporation>("corporations")
      .findOne({ _id: targetSector.corporationId });
    if (!defender) {
      await db.collection<CorporateSector>("corporateSectors").deleteOne({ _id: targetSector._id });
      return errorResponse(
        404,
        "That corporation has been dissolved. Its sector record was removed; refresh this market."
      );
    }
    if (defender.countryOwnerId) {
      return errorResponse(400, "Cannot attack state-owned corporations.");
    }
    if (defender.suspended) {
      return errorResponse(
        400,
        "Cannot attack a corporation that is suspended pending privatization auction."
      );
    }

    if (
      !Number.isInteger(targetSector.plantCount) ||
      (targetSector.plantCount ?? 0) < 2 ||
      typeof targetSector.capacityBookAnchor !== "number" ||
      !Number.isFinite(targetSector.capacityBookAnchor) ||
      targetSector.capacityBookAnchor < 0
    ) {
      return errorResponse(
        503,
        "This sector's whole-plant ledger is not ready yet. Try again after the next refresh."
      );
    }

    const attackerFxRate = await getCorpFxRate(db, attacker);
    const attackerCurrencyCode = resolveCorpLiquidCurrencyCode(attacker);
    const randomRoll = auditableRandomRoll();
    const attempt = await attemptPlantSectorSplit(db, {
      attacker,
      defender,
      targetSector,
      targetSectorId,
      stateId,
      countryId,
      currentTurn: gameState?.currentTurn ?? 0,
      attackerFxRate,
      attackerCurrencyCode,
      randomRoll,
    });
    if (!attempt.ok) return errorResponse(attempt.status, attempt.error);

    const result: SplitResolution = attempt.resolution;
    const sectorLabel = OPERATING_SECTOR_TYPE_LABELS[result.sectorType] ?? result.sectorType;
    // Suggestion #324: say what moved in value terms too, so the defender can
    // tell plants seized from cash, revenue, or profit. The $ below is the
    // transferred plants' book value, not revenue or profit.
    const outcomeText = result.succeeded
      ? `${attacker.name} seized ${result.plantsTransferred.toLocaleString("en-US")} whole plants (~$${Math.round(result.bookValueTransferredAnchor).toLocaleString("en-US")} book value) from ${result.defenderCorporationName}'s ${sectorLabel} sector in ${state.name}.`
      : `${attacker.name} failed to split ${result.defenderCorporationName}'s ${sectorLabel} sector in ${state.name}.`;
    logWireEvent("sector_attack", outcomeText, {
      href: `${regionUrl(countryId, stateId)}?tab=economy&sector=${result.sectorType}`,
    });

    void emitTx(db, {
      type: "corp_sector_split_cost",
      turn: gameState?.currentTurn ?? 0,
      createdAt: new Date(),
      subjectType: "corporation",
      subjectId: attacker._id,
      subjectName: attacker.name,
      countryId,
      amount: -Math.abs(result.attackCostLocal),
      anchorAmount: -Math.abs(result.quote.cashCostAnchor),
      currencyCode: attackerCurrencyCode ?? "USD",
      counterpartyType: "system",
      counterpartyName: "Sector split campaign",
      meta: {
        targetSectorId: targetSectorId.toString(),
        defenderCorporationId: defender._id.toString(),
        plantsAtRisk: result.quote.plantsAtRisk,
        plantsTransferred: result.plantsTransferred,
        successProbability: result.quote.successProbability,
        randomRoll: result.randomRoll,
        succeeded: result.succeeded,
      },
    }).catch(() => {});

    void logEconomicAction(db, {
      characterId: attacker.ceoId,
      userId: auth.user.userId,
      actionType: "attackSector",
      targetState: stateId,
      turn: gameState?.currentTurn ?? 0,
      characterName: attacker.name,
      username: userDoc?.username,
      countryId,
      corpCashCostAnchor: result.quote.cashCostAnchor,
      msCost: result.quote.marketingStrengthCost,
      currencyCode: attackerCurrencyCode,
      result: {
        success: result.succeeded,
        message: outcomeText,
        fundsChange: -result.attackCostLocal,
      },
    }).catch(() => {});

    if (defender.userId && !defender.ceoVacant) {
      await createNotification({
        userId: defender.userId,
        type: "corp_sector_attacked",
        title: result.succeeded ? "Plants Seized" : "Sector Split Repelled",
        message: outcomeText,
        metadata: {
          attackerCorporationName: attacker.name,
          attackerCorporationId: attacker._id.toString(),
          sectorType: result.sectorType,
          sectorLabel,
          stateId,
          stateName: state.name,
          countryId,
          plantsLost: result.plantsTransferred,
          bookValueTransferredAnchor: result.bookValueTransferredAnchor,
          captureKind: "capacity",
          splitSucceeded: result.succeeded,
        },
      });
    }

    return NextResponse.json({
      success: true,
      splitSucceeded: result.succeeded,
      plantsAtRisk: result.quote.plantsAtRisk,
      plantsTransferred: result.plantsTransferred,
      attackCost: result.quote.cashCostAnchor,
      msCost: result.quote.marketingStrengthCost,
      successProbability: result.quote.successProbability,
      message: result.succeeded
        ? `Sector split succeeded. You seized ${result.plantsTransferred.toLocaleString("en-US")} whole ${result.plantsTransferred === 1 ? "plant" : "plants"} from ${result.defenderCorporationName}.`
        : `Sector split failed. No plants transferred; the committed cash and MS were spent.`,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
