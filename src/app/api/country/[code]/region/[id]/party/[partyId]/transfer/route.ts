import { NextResponse } from "next/server";
import { type ClientSession, type UpdateFilter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { runWithDbSession } from "@/lib/db/sessionDb";
import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { badRequest, handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { statePartyTransferSchema } from "@/lib/api/schemas/settings";
import { getPartyBudgetCollection } from "@/lib/db/collections";
import type { StatePartyOrg, PoliticalParty } from "@/lib/db/types";
import { findPartyBySequentialId, getStatePartyOrgDocumentId } from "@/lib/db/partyLookup";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { findPartyBudgetForScope } from "@/lib/partyBudgetGuards";
import { wouldTriggerTreasuryReserveOverride } from "@/lib/partyTreasuryPlan";
import { emitTreasuryTransaction } from "@/lib/treasury/emit";
import { isSameCountry } from "@/lib/api/sameCountry";
import { statesCollection } from "@/lib/db/repositories/states";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { adminLogsCollection } from "@/lib/db/repositories/adminLogs";
import type { Document } from "mongodb";

interface RouteParams {
  params: Promise<{ code: string; id: string; partyId: string }>;
}

// POST /api/country/[code]/region/[id]/party/[partyId]/transfer — Transfer funds from the state party treasury to the national party
// Auth: requireAuthWithCharacter
// Errors: 400, 401, 403, 404, 429
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { code, id, partyId } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(400, "Invalid country code");
    }
    const stateId = id;

    // Verify authentication
    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/country/[code]/region/[id]/party/[partyId]/transfer:${auth.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);
    const authUser = auth.user;

    const parsed = await parseJsonBody(request, statePartyTransferSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { amount } = parsed.data;

    const db = await getDb();
    return await withAtomicEconomicCommand(db, async (db) => {
      // Verify state exists
      const state = await statesCollection(db).findOne({ _id: stateId, countryId });
      if (!state) {
        return errorResponse(404, "State not found");
      }

      // Verify party exists
      const party = await findPartyBySequentialId(db, partyId, countryId);
      if (!party) {
        return errorResponse(404, "Party not found");
      }

      const partyKey = String(party.sequentialId);
      const statePartyKey = getStatePartyOrgDocumentId(stateId, party);
      const stateParty = await statePartyOrgCollection(db).findOne({ _id: statePartyKey });

      if (!stateParty) {
        return errorResponse(404, "State party not found");
      }

      // Check authorization: admin, national chair, state chair, vice chair, or state treasurer
      const isAdmin = authUser.isAdmin;
      const isNationalChair = party.chairId?.equals(authUser.character._id);
      const isStateChair = stateParty.chairId?.equals(authUser.character._id);
      const isStateViceChair = stateParty.viceChairId?.equals(authUser.character._id);
      const isStateTreasurer = stateParty.treasurerId?.equals(authUser.character._id);

      if (!isAdmin && !isNationalChair && !isStateChair && !isStateViceChair && !isStateTreasurer) {
        return errorResponse(
          403,
          "Only the state chair, vice chair, treasurer, national chair, or an admin can transfer funds"
        );
      }

      // Defense-in-depth: even if the actor's _id matches a chair/treasurer
      // record, refuse if their character somehow belongs to another country.
      if (!isAdmin && !isSameCountry(authUser.character, { countryId })) {
        return errorResponse(
          403,
          "You must be a citizen of this country to transfer state party funds"
        );
      }

      // Check treasury balance
      const treasury = stateParty.treasury ?? 0;
      if (amount > treasury) {
        return errorResponse(
          400,
          `Insufficient treasury balance. Available: $${treasury.toLocaleString()}`
        );
      }
      const budgetCollection = await getPartyBudgetCollection(db);
      const treasuryPlan = await findPartyBudgetForScope(budgetCollection, {
        countryId,
        partyId: partyKey,
        scope: "state",
        stateId,
      });
      const reserveBreach = wouldTriggerTreasuryReserveOverride(treasury, amount, treasuryPlan);
      const reserveWarning =
        reserveBreach && !isStateTreasurer
          ? "Emergency override: transfer pierced the Treasurer reserve target."
          : null;

      const now = new Date();
      const statePartyDebit: UpdateFilter<StatePartyOrg> = {
        $inc: { treasury: -amount },
        $set: { updatedAt: now },
      };
      const nationalPartyCredit: UpdateFilter<PoliticalParty> = {
        $inc: { treasury: amount },
        $set: { updatedAt: now },
      };

      const applyTransferInTransaction = async (session: ClientSession) => {
        const debitResult = await statePartyOrgCollection(db).updateOne(
          { _id: statePartyKey, treasury: { $gte: amount } },
          statePartyDebit,
          {
            session,
          }
        );

        if (debitResult.matchedCount === 0) {
          throw badRequest(
            `Insufficient treasury balance. Available: $${treasury.toLocaleString()}`
          );
        }

        const creditResult = await politicalPartiesCollection(db).updateOne(
          { _id: party._id },
          nationalPartyCredit,
          { session }
        );

        if (creditResult.matchedCount === 0) {
          throw notFound("Party not found");
        }
      };

      await runWithDbSession(db, applyTransferInTransaction);

      // Log the action
      await adminLogsCollection<Document>(db).insertOne({
        category: "system",
        action: "funds_transferred",
        username: authUser.username,
        characterName: authUser.character.name,
        adminUsername: isAdmin ? authUser.username : undefined,
        details: `Transferred $${amount.toLocaleString()} from ${state.name} ${party.name} to national treasury${reserveWarning ? ` (${reserveWarning})` : ""}`,
        createdAt: now,
      });

      // Treasury audit log: debit on the state party, credit on the
      // national party.
      await emitTreasuryTransaction({
        db,
        countryId,
        partyId,
        holderType: "state_party",
        holderId: statePartyKey,
        category: "transfers",
        direction: "debit",
        amount,
        memo: `Transfer to ${party.name} national treasury`,
        counterparty: { type: "party", id: partyId, label: party.name },
        now,
      });
      await emitTreasuryTransaction({
        db,
        countryId,
        partyId,
        holderType: "party",
        holderId: partyId,
        category: "transfers",
        direction: "credit",
        amount,
        memo: `Transfer from ${state.name} ${party.name}`,
        counterparty: { type: "state_party", id: statePartyKey, label: state.name },
        now,
      });

      return NextResponse.json({
        success: true,
        message: `Transferred $${amount.toLocaleString()} to ${party.name} national treasury${reserveWarning ? ` ${reserveWarning}` : ""}`,
        warning: reserveWarning,
        amount,
        remainingTreasury: treasury - amount,
      });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
