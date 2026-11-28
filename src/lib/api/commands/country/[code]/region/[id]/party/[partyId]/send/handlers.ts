import { vacateBannedOfficerSeats } from "@/lib/parties/bannedOfficers";
import { NextResponse } from "next/server";
import { ObjectId, type ClientSession, type UpdateFilter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { runWithDbSession } from "@/lib/db/sessionDb";
import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { requireAuth } from "@/lib/api/requireAuth";
import { badRequest, handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { parseObjectId } from "@/lib/utils/objectId";
import { parseJsonBody } from "@/lib/api/validate";
import { sendFundsSchema } from "@/lib/api/schemas/send";
import type { StatePartyOrg, AdminLog } from "@/lib/db/types";
import {
  findPartyBySequentialId,
  getPartyIdString,
  getStatePartyOrgDocumentId,
} from "@/lib/db/partyLookup";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { requirePlayerTransfersEnabled } from "@/lib/api/requirePlayerTransfers";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { getPartyBudgetCollection } from "@/lib/db/collections";
import { findPartyBudgetForScope } from "@/lib/partyBudgetGuards";
import { wouldTriggerTreasuryReserveOverride } from "@/lib/partyTreasuryPlan";
import { emitTreasuryTransaction } from "@/lib/treasury/emit";
import { emitPartyCampaignFunds } from "@/lib/financialTxLog/partyCampaignFunds";
import { COUNTRY_CURRENCY_MAP, getSeedCurrencyCode } from "@/lib/constants/currencies";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { getGameState } from "@/lib/gameState";
import { checkPlayerPayoutCap } from "@/lib/treasury/payoutCap";
// Imported from the values module, not the re-export on `payoutCap`: it is a
// pure helper with no database dependency, and tests that mock the
// database-facing module should not have to stub it.
import { countDistinctOfficers } from "@/lib/treasury/payoutCapValues";
import {
  isLeadershipElectionFreezeActive,
  LEADERSHIP_FREEZE_MESSAGE,
} from "@/lib/parties/leadershipElectionFreeze";
import { getGameStateCore } from "@/lib/gameState";
import { isSameCountry } from "@/lib/api/sameCountry";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { adminLogsCollection } from "@/lib/db/repositories/adminLogs";
import { activityLogCollection } from "@/lib/db/repositories/activityLog";
import type { Document } from "mongodb";

interface RouteParams {
  params: Promise<{ code: string; id: string; partyId: string }>;
}

// POST /api/country/[code]/region/[id]/party/[partyId]/send — Send funds from the state party treasury to a member character
// Auth: requireAuth
// Errors: 400, 401, 403, 404, 429
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { code, id, partyId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }
    const stateId = id;

    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    const authUser = auth.user;

    const rateLimit = checkRateLimit(
      `api/country/[code]/region/[id]/party/[partyId]/send:${authUser.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const parsed = await parseJsonBody(request, sendFundsSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { characterId, amount: sendAmount } = parsed.data;
    const targetCharacterOid = parseObjectId(characterId);
    if (!targetCharacterOid) {
      return errorResponse(400, "Invalid character ID");
    }

    const db = await getDb();
    return await withAtomicEconomicCommand(db, async (db) => {
      const transferGuard = await requirePlayerTransfersEnabled(db);
      if (transferGuard) return transferGuard;

      // Verify party exists
      const party = await findPartyBySequentialId(db, partyId, countryId);
      if (!party) {
        return errorResponse(404, "Party not found");
      }

      const partyKey = getPartyIdString(party);
      const statePartyKey = getStatePartyOrgDocumentId(stateId, party);
      const statePartyOrg = await statePartyOrgCollection(db).findOne({
        _id: statePartyKey,
      });

      if (!statePartyOrg) {
        return errorResponse(404, "State party not found");
      }
      await vacateBannedOfficerSeats(db, statePartyOrg);
      await vacateBannedOfficerSeats(db, party);

      // Check authorization: admin, national chair, state chair, vice chair, or state treasurer
      const isAdmin = authUser.isAdmin;
      const isNationalChair =
        authUser.character && party.chairId?.toString() === authUser.character._id.toString();
      const isStateChair =
        authUser.character &&
        statePartyOrg.chairId?.toString() === authUser.character._id.toString();
      const isStateViceChair =
        authUser.character &&
        statePartyOrg.viceChairId?.toString() === authUser.character._id.toString();
      const isStateTreasurer =
        authUser.character &&
        statePartyOrg.treasurerId?.toString() === authUser.character._id.toString();

      if (!isAdmin && !isNationalChair && !isStateChair && !isStateViceChair && !isStateTreasurer) {
        return errorResponse(403, "Not authorized");
      }

      // Defense-in-depth: even with a matching role _id, refuse if the actor's
      // character belongs to another country (mismatched/inconsistent data).
      if (!isAdmin && authUser.character && !isSameCountry(authUser.character, { countryId })) {
        return errorResponse(
          403,
          "You must be a citizen of this country to send state party funds"
        );
      }

      // Verify target character exists and is a member of this state party
      const targetCharacter = await charactersCollection(db).findOne({
        _id: targetCharacterOid,
      });

      if (!targetCharacter) {
        return errorResponse(404, "Character not found");
      }

      if (
        targetCharacter.party !== partyKey ||
        targetCharacter.homeState !== stateId ||
        !isSameCountry(targetCharacter, { countryId })
      ) {
        return errorResponse(400, "Character is not a member of this state party");
      }

      // Check treasury balance
      // Party leadership handover freeze, then the recipient's per-turn
      // cap. State party money counts towards the same combined ceiling as
      // national money, or the cap could be drawn once per state party.
      const clock = await getGameStateCore(db);
      if (!clock) return errorResponse(409, "The game clock is unavailable. Try again shortly.");
      const { currentTurn } = clock;
      if (!isAdmin) {
        if (await isLeadershipElectionFreezeActive(db, party, currentTurn)) {
          return errorResponse(400, LEADERSHIP_FREEZE_MESSAGE);
        }
        const cap = await checkPlayerPayoutCap(db, {
          characterId: targetCharacterOid,
          countryId,
          currentTurn,
          amount: sendAmount,
          // The STATE org's own seats, not the national party's: each
          // treasury is judged on the oversight actually watching it.
          seatedOfficers: countDistinctOfficers([
            statePartyOrg?.chairId?.toString(),
            statePartyOrg?.viceChairId?.toString(),
            statePartyOrg?.treasurerId?.toString(),
          ]),
        });
        if (!cap.ok) {
          return errorResponse(400, cap.reason);
        }
      }

      const treasury = statePartyOrg.treasury ?? 0;
      if (treasury < sendAmount) {
        return errorResponse(400, "Insufficient treasury funds");
      }
      const budgetCollection = await getPartyBudgetCollection(db);
      const treasuryPlan = await findPartyBudgetForScope(budgetCollection, {
        countryId,
        partyId: partyKey,
        scope: "state",
        stateId,
      });
      const reserveBreach = wouldTriggerTreasuryReserveOverride(treasury, sendAmount, treasuryPlan);
      const reserveWarning =
        reserveBreach && !isStateTreasurer
          ? "Emergency override: send pierced the Treasurer reserve target."
          : null;

      const now = new Date();
      const forexEnabled = await isForexEnabled();
      // Post-Phase-6: state-party treasury and recipient campaign balance are
      // both in the same local home currency.
      const recipientFundsField = forexEnabled ? "currencyBalances.campaign" : "funds";
      const statePartyDebit: UpdateFilter<StatePartyOrg> = {
        $inc: { treasury: -sendAmount },
        $set: { updatedAt: now },
      };
      const characterCredit = {
        $inc: { [recipientFundsField]: sendAmount },
      };

      const applySendInTransaction = async (session: ClientSession) => {
        const debitResult = await statePartyOrgCollection(db).updateOne(
          { _id: statePartyKey, treasury: { $gte: sendAmount } },
          statePartyDebit,
          {
            session,
          }
        );

        if (debitResult.matchedCount === 0) {
          throw badRequest("Insufficient treasury funds");
        }

        const creditResult = await charactersCollection(db).updateOne(
          { _id: targetCharacterOid },
          characterCredit,
          { session }
        );

        if (creditResult.matchedCount === 0) {
          throw notFound("Character not found");
        }
      };

      await runWithDbSession(db, applySendInTransaction);

      // Log the action
      const adminLog: AdminLog = {
        _id: new ObjectId(),
        createdAt: now,
        category: "election",
        action: "funds_transferred",
        username: targetCharacter.name,
        adminUsername: authUser.username,
        details: `Sent $${sendAmount.toLocaleString()} from ${stateId} ${party.name} treasury to ${targetCharacter.name}${reserveWarning ? ` (${reserveWarning})` : ""}`,
      };
      await adminLogsCollection(db).insertOne(adminLog);

      const gameStateForCurrency = await getGameState(db).catch(() => null);
      await emitPartyCampaignFunds(db, {
        characterId: targetCharacterOid,
        characterName: targetCharacter.name,
        amount: sendAmount,
        currencyCode: gameStateForCurrency
          ? getSeedCurrencyCode(countryId, gameStateForCurrency.preset ?? DEFAULT_SEED_PRESET)
          : (COUNTRY_CURRENCY_MAP[countryId] ?? "USD"),
        turn: currentTurn,
        partyId: String(party._id),
        partyName: party.name,
        flow: "payout",
        statePartyKey,
      });

      await emitTreasuryTransaction({
        db,
        countryId,
        partyId,
        holderType: "state_party",
        holderId: statePartyKey,
        category: "transfers",
        direction: "debit",
        amount: sendAmount,
        memo: `Send to ${targetCharacter.name}`,
        counterparty: {
          type: "character",
          id: targetCharacterOid.toString(),
          label: targetCharacter.name,
        },
        initiatedBy: authUser.character
          ? {
              type: "character" as const,
              id: authUser.character._id.toString(),
              label: authUser.character.name,
            }
          : undefined,
        // Same turn the payout cap was checked against, so the check and
        // the record cannot land in different turn buckets.
        turn: currentTurn,
        now,
      });

      // Fire-and-forget: log fund flow for admin activity tracking
      if (authUser.character) {
        await activityLogCollection<Document>(db).insertOne({
          type: "fund_event",
          timestamp: now,
          userId: new ObjectId(authUser.userId),
          characterId: authUser.character._id,
          characterName: authUser.character.name,
          username: authUser.username,
          countryId,
          fundEventType: "party_transfer",
          amount: sendAmount,
          currencyCode: COUNTRY_CURRENCY_MAP[countryId] ?? "USD",
          fromId: party._id, // statePartyOrg has no ObjectId; use national party _id as proxy
          fromName: `${stateId} ${party.name}`,
          fromType: "party",
          toId: targetCharacterOid,
          toName: targetCharacter.name,
          toType: "character",
        });
      }

      return NextResponse.json({
        message: `Sent $${sendAmount.toLocaleString()} to ${targetCharacter.name}${reserveWarning ? ` ${reserveWarning}` : ""}`,
        warning: reserveWarning,
      });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
