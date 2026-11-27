import { ObjectId, type ClientSession, type UpdateFilter } from "mongodb";
import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { boundSession, runWithDbSession } from "@/lib/db/sessionDb";
import { withAtomicResult } from "@/lib/db/withAtomicResult";
import { fenceEconomicTurn } from "@/lib/api/withAtomicEconomicCommand";
import { badRequest, errorResponse } from "@/lib/api/errors";
import type { PoliticalParty, State } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { getSeedCurrencyCode, type CurrencyCode } from "@/lib/constants/currencies";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { emitTreasuryTransaction } from "@/lib/treasury/emit";
import { emitTx } from "@/lib/financialTxLog/emit";
import { getGameState } from "@/lib/gameState";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { adminLogsCollection } from "@/lib/db/repositories/adminLogs";
import type { Document } from "mongodb";
import { activityLogCollection } from "@/lib/db/repositories/activityLog";

export interface ExecuteTransferToStateArgs {
  db: Db;
  countryId: CountryId;
  party: Pick<PoliticalParty, "_id" | "name" | "sequentialId" | "treasury">;
  state: Pick<State, "_id" | "name">;
  amount: number;
  reserveWarning: string | null;
  initiator: { _id: ObjectId; name: string };
  initiatorUsername: string;
  initiatorUserId: string;
  isAdmin: boolean;
}

export async function executeTransferToStateParty(
  args: ExecuteTransferToStateArgs
): Promise<{ ok: boolean; response: NextResponse }> {
  return withAtomicResult(args.db, async (db) => {
    const refusal = await fenceEconomicTurn(db);
    if (refusal) return { ok: false, response: errorResponse(refusal.status, refusal.error) };
    return executeTransferToStatePartyAtomic({ ...args, db });
  });
}

async function executeTransferToStatePartyAtomic(
  args: ExecuteTransferToStateArgs
): Promise<{ ok: boolean; response: NextResponse }> {
  const { db, countryId, party, state, amount, reserveWarning, initiator } = args;
  const partyIdStr = String(party.sequentialId);
  const upperStateId = String(state._id).toUpperCase();
  const now = new Date();
  const statePartyKey = `${upperStateId}_${partyIdStr}`;
  const treasury = party.treasury ?? 0;

  const partyDebit: UpdateFilter<PoliticalParty> = {
    $inc: { treasury: -amount },
    $set: { updatedAt: now },
  };
  const statePartyCredit = {
    $inc: { treasury: amount },
    $set: { updatedAt: now },
    $setOnInsert: {
      _id: statePartyKey,
      stateId: upperStateId,
      partyId: partyIdStr,
      countryId,
      organization: 0,
      chairId: null,
      viceChairId: null,
      treasurerId: null,
      stateTaxRate: 0,
      politicalStrength: 0,
      hasPresence: false,
      createdAt: now,
    },
  };

  const applyInTransaction = async (session: ClientSession) => {
    const debitResult = await politicalPartiesCollection(db).updateOne(
      { _id: party._id, treasury: { $gte: amount } },
      partyDebit,
      { session }
    );
    if (debitResult.matchedCount === 0) {
      throw badRequest(`Insufficient treasury balance. Available: $${treasury.toLocaleString()}`);
    }
    await statePartyOrgCollection(db).updateOne({ _id: statePartyKey }, statePartyCredit, {
      upsert: true,
      session,
    });
  };

  await runWithDbSession(db, applyInTransaction);

  try {
    await adminLogsCollection<Document>(db).insertOne({
      category: "system",
      action: "funds_transferred",
      username: args.initiatorUsername,
      characterName: initiator.name,
      adminUsername: args.isAdmin ? args.initiatorUsername : undefined,
      details: `Transferred $${amount.toLocaleString()} from ${party.name} national treasury to ${state.name}${
        reserveWarning ? ` (${reserveWarning})` : ""
      }`,
      createdAt: now,
    });

    // Record currency: the world's seed home code, so 2027 euro members
    // stamp EUR on every audit row. A gameState failure resolves to the
    // default preset (era-blind map), never to a throw — nothing below may
    // throw (see the PAST THIS POINT contract above).
    const gameState = await getGameState(db);
    const txCurrency = getSeedCurrencyCode(
      countryId,
      gameState?.preset ?? DEFAULT_SEED_PRESET
    ) as CurrencyCode;

    await emitTreasuryTransaction({
      db,
      countryId,
      partyId: partyIdStr,
      holderType: "party",
      holderId: partyIdStr,
      category: "transfers",
      direction: "debit",
      amount,
      memo: `Transfer to ${state.name} state party`,
      counterparty: { type: "state_party", id: statePartyKey, label: state.name },
      initiatedBy: {
        type: "character",
        id: initiator._id.toString(),
        label: initiator.name,
      },
      now,
      currencyCode: txCurrency,
    });
    await emitTreasuryTransaction({
      db,
      countryId,
      partyId: partyIdStr,
      holderType: "state_party",
      holderId: statePartyKey,
      category: "transfers",
      direction: "credit",
      amount,
      memo: `Transfer from ${party.name} national treasury`,
      counterparty: { type: "party", id: partyIdStr, label: party.name },
      initiatedBy: {
        type: "character",
        id: initiator._id.toString(),
        label: initiator.name,
      },
      now,
      currencyCode: txCurrency,
    });
    await emitTx(db, {
      type: "party_transfer",
      turn: gameState?.currentTurn ?? 0,
      createdAt: now,
      subjectType: "party",
      subjectName: party.name,
      amount: -amount,
      currencyCode: txCurrency,
      counterpartyType: "party",
      counterpartyName: `${state.name} state party`,
      meta: {
        partyId: String(party._id),
        statePartyKey,
        stateId: upperStateId,
        countryId,
        side: "national_outflow",
      },
    });
    await emitTx(db, {
      type: "party_transfer",
      turn: gameState?.currentTurn ?? 0,
      createdAt: now,
      subjectType: "party",
      subjectName: `${state.name} state party`,
      amount,
      currencyCode: txCurrency,
      counterpartyType: "party",
      counterpartyName: party.name,
      meta: {
        partyId: String(party._id),
        statePartyKey,
        stateId: upperStateId,
        countryId,
        side: "state_inflow",
      },
    });

    await activityLogCollection<Document>(db).insertOne({
      type: "fund_event",
      timestamp: new Date(),
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
      toId: party._id, // statePartyOrg has no ObjectId; use national party _id as proxy
      toName: `${state.name} ${party.name}`,
      toType: "party",
    });
  } catch (err) {
    if (boundSession(db)) throw err;
    console.error(
      JSON.stringify({
        error: "treasury_state_transfer_audit_failed",
        operation: "execute_transfer_to_state_party",
        partyId: partyIdStr,
        countryId,
        stateId: upperStateId,
        amount,
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }

  return {
    ok: true,
    response: NextResponse.json({
      success: true,
      message: `Transferred $${amount.toLocaleString()} to ${state.name} ${party.name}${
        reserveWarning ? ` ${reserveWarning}` : ""
      }`,
      warning: reserveWarning,
      amount,
      remainingTreasury: treasury - amount,
    }),
  };
}
