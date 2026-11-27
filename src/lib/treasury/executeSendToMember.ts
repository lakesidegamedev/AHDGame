import { ObjectId, type ClientSession, type UpdateFilter } from "mongodb";
import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { boundSession, runWithDbSession } from "@/lib/db/sessionDb";
import { withAtomicResult } from "@/lib/db/withAtomicResult";
import { fenceEconomicTurn } from "@/lib/api/withAtomicEconomicCommand";
import { badRequest, notFound, errorResponse } from "@/lib/api/errors";
import type { AdminLog, Character, PoliticalParty } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getSeedCurrencyCode } from "@/lib/constants/currencies";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { getGameState } from "@/lib/gameState";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { emitTreasuryTransaction } from "@/lib/treasury/emit";
import { emitPartyCampaignFunds } from "@/lib/financialTxLog/partyCampaignFunds";
import { checkPlayerPayoutCap } from "@/lib/treasury/payoutCap";
// Imported from the values module, not the re-export on `payoutCap`: it is a
// pure helper with no database dependency, and tests that mock the
// database-facing module should not have to stub it.
import { countDistinctOfficers } from "@/lib/treasury/payoutCapValues";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { adminLogsCollection } from "@/lib/db/repositories/adminLogs";
import { activityLogCollection } from "@/lib/db/repositories/activityLog";
import type { Document } from "mongodb";

export interface ExecuteSendToMemberArgs {
  db: Db;
  countryId: CountryId;
  /**
   * Officer seats are included because the recipient's per-turn ceiling
   * rises once two different officers are seated on the paying body.
   */
  party: Pick<
    PoliticalParty,
    "_id" | "name" | "sequentialId" | "treasury" | "chairId" | "viceChairId" | "treasurerId"
  >;
  targetCharacter: Pick<Character, "_id" | "name">;
  amount: number;
  /** Pre-formatted reserve warning, or null. Folded into log + response. */
  reserveWarning: string | null;
  /** The character whose action triggered the execute (proposer in single mode, approver in double mode). */
  initiator: { _id: ObjectId; name: string };
  /** Auth username, for adminLog.adminUsername field. */
  initiatorUsername: string;
  /** Auth userId, for activityLog.userId. */
  initiatorUserId: string;
  /**
   * Current game turn, used for the recipient's per-turn payout cap.
   * Passed in rather than read here so the cap stays testable and the
   * executor keeps no clock dependency of its own.
   */
  currentTurn: number;
  /**
   * Skip the payout cap. Admin actions only — admins already bypass the
   * rest of the treasury workflow.
   */
  skipPayoutCap?: boolean;
}

/**
 * Returns either:
 *   - `{ ok: true, response }` — the route should `return response` (200 JSON)
 *   - `{ ok: false, response }` — the route should `return response` (4xx JSON)
 *
 * Either way the caller can pass `response` straight through.
 */
export async function executeSendToMember(
  args: ExecuteSendToMemberArgs
): Promise<{ ok: boolean; response: NextResponse }> {
  return withAtomicResult(args.db, async (db) => {
    const refusal = await fenceEconomicTurn(db);
    if (refusal) return { ok: false, response: errorResponse(refusal.status, refusal.error) };
    return executeSendToMemberAtomic({ ...args, db });
  });
}

async function executeSendToMemberAtomic(
  args: ExecuteSendToMemberArgs
): Promise<{ ok: boolean; response: NextResponse }> {
  const { db, countryId, party, targetCharacter, amount, reserveWarning, initiator } = args;
  const partyIdStr = String(party.sequentialId);

  // Per-turn ceiling on what one player can receive from party funds.
  // Checked here rather than in the routes so both the direct send and
  // the Request Funds approval path are covered by one guard.
  if (!args.skipPayoutCap) {
    const cap = await checkPlayerPayoutCap(db, {
      characterId: targetCharacter._id,
      countryId,
      currentTurn: args.currentTurn,
      amount,
      seatedOfficers: countDistinctOfficers([
        party.chairId?.toString(),
        party.viceChairId?.toString(),
        party.treasurerId?.toString(),
      ]),
    });
    if (!cap.ok) {
      return { ok: false, response: errorResponse(400, cap.reason) };
    }
  }

  const now = new Date();
  const forexEnabled = await isForexEnabled();
  // Post-Phase-6: party treasury and recipient campaign balance are
  // both in the same local home currency (same country = same currency).
  const recipientFundsField = forexEnabled ? "currencyBalances.campaign" : "funds";
  const partyDebit: UpdateFilter<PoliticalParty> = {
    $inc: { treasury: -amount },
    $set: { updatedAt: now },
  };
  const characterCredit = {
    $inc: { [recipientFundsField]: amount },
  };

  const applyInTransaction = async (session: ClientSession) => {
    const debitResult = await politicalPartiesCollection(db).updateOne(
      { _id: party._id, treasury: { $gte: amount } },
      partyDebit,
      { session }
    );
    if (debitResult.matchedCount === 0) {
      throw badRequest("Insufficient treasury funds");
    }
    const creditResult = await charactersCollection(db).updateOne(
      { _id: targetCharacter._id },
      characterCredit,
      { session }
    );
    if (creditResult.matchedCount === 0) {
      throw notFound("Character not found");
    }
  };

  await runWithDbSession(db, applyInTransaction);

  const state = await getGameState(db);
  const txCurrency = getSeedCurrencyCode(countryId, state?.preset ?? DEFAULT_SEED_PRESET);
  const adminLog: AdminLog = {
    _id: new ObjectId(),
    createdAt: now,
    category: "election",
    action: "funds_transferred",
    username: targetCharacter.name,
    adminUsername: args.initiatorUsername,
    details: `Sent $${amount.toLocaleString()} from ${party.name} treasury to ${targetCharacter.name}${
      reserveWarning ? ` (${reserveWarning})` : ""
    }`,
  };
  try {
    await adminLogsCollection(db).insertOne(adminLog);
  } catch (err) {
    if (boundSession(db)) throw err;
    console.error(
      JSON.stringify({
        error: "treasury_send_admin_log_failed",
        operation: "execute_send_to_member",
        partyId: partyIdStr,
        countryId,
        amount,
        recipientId: targetCharacter._id.toString(),
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }

  await emitPartyCampaignFunds(db, {
    characterId: targetCharacter._id,
    characterName: targetCharacter.name,
    amount,
    currencyCode: txCurrency,
    turn: args.currentTurn,
    partyId: partyIdStr,
    partyName: party.name,
    flow: "payout",
  });

  try {
    await emitTreasuryTransaction({
      db,
      countryId,
      partyId: partyIdStr,
      holderType: "party",
      holderId: partyIdStr,
      category: "transfers",
      direction: "debit",
      amount,
      memo: `Send to ${targetCharacter.name}`,
      counterparty: {
        type: "character",
        id: targetCharacter._id.toString(),
        label: targetCharacter.name,
      },
      initiatedBy: {
        type: "character",
        id: initiator._id.toString(),
        label: initiator.name,
      },
      // Stamp the SAME turn the payout cap was checked against. Left to
      // its fallback the emit re-reads gameState, and getGameTime is cached
      // for 5s, so around a turn boundary the check could count turn N
      // while the row landed in turn N+1 — handing the recipient a second
      // full allowance.
      turn: args.currentTurn,
      now,
      currencyCode: txCurrency,
    });
  } catch (err) {
    if (boundSession(db)) throw err;
    console.error(
      JSON.stringify({
        error: "treasury_send_emit_failed",
        operation: "execute_send_to_member",
        partyId: partyIdStr,
        countryId,
        amount,
        recipientId: targetCharacter._id.toString(),
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }

  // Fire-and-forget activity log row for the admin activity-tracking view.
  // Guarded like the writes above: `new ObjectId(...)` throws
  // SYNCHRONOUSLY on a malformed id, so even a call that is never
  // awaited can escape this function with the money already moved.
  try {
    await activityLogCollection<Document>(db).insertOne({
      type: "fund_event",
      timestamp: now,
      userId: new ObjectId(args.initiatorUserId),
      characterId: initiator._id,
      characterName: initiator.name,
      username: args.initiatorUsername,
      countryId,
      fundEventType: "party_transfer",
      amount,
      currencyCode: txCurrency,
      fromId: party._id,
      fromName: party.name,
      fromType: "party",
      toId: targetCharacter._id,
      toName: targetCharacter.name,
      toType: "character",
    });
  } catch (err) {
    if (boundSession(db)) throw err;
    console.error(
      JSON.stringify({
        error: "treasury_send_activity_log_failed",
        operation: "execute_send_to_member",
        partyId: partyIdStr,
        countryId,
        amount,
        recipientId: targetCharacter._id.toString(),
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }

  return {
    ok: true,
    response: NextResponse.json({
      message: `Sent $${amount.toLocaleString()} to ${targetCharacter.name}${
        reserveWarning ? ` ${reserveWarning}` : ""
      }`,
      warning: reserveWarning,
    }),
  };
}
