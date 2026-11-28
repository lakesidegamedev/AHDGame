import { boundSession } from "@/lib/db/sessionDb";
import type { Db, ObjectId } from "mongodb";
import * as Sentry from "@sentry/nextjs";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { emitTx } from "@/lib/financialTxLog/emit";

export interface PartyCampaignFundsInput {
  characterId: ObjectId;
  characterName: string;
  /** Positive when the character receives party money, negative when they give it. */
  amount: number;
  currencyCode: CurrencyCode;
  turn: number;
  partyId: string;
  partyName: string;
  /** "donation" for a member giving to the party, "payout" for the party sending to a member. */
  flow: "donation" | "payout";
  statePartyKey?: string;
}

/**
 * Record party money moving in or out of a character's campaign funds on the
 * character's own log, so their money history shows it. The party side is
 * recorded separately by the treasury emit. Never throws: the money has
 * already moved when this runs.
 */
export async function emitPartyCampaignFunds(
  db: Db,
  input: PartyCampaignFundsInput
): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount === 0) return;
  try {
    await emitTx(db, {
      type: "party_transfer",
      turn: input.turn,
      createdAt: new Date(),
      subjectType: "character",
      subjectId: input.characterId,
      subjectName: input.characterName,
      amount: input.amount,
      currencyCode: input.currencyCode,
      counterpartyType: "party",
      counterpartyName: input.partyName,
      meta: {
        wallet: "campaign",
        flow: input.flow,
        partyId: input.partyId,
        ...(input.statePartyKey ? { statePartyKey: input.statePartyKey } : {}),
      },
    });
  } catch (err) {
    if (boundSession(db)) throw err;
    Sentry.captureException(err, { tags: { operation: "emit_party_campaign_funds" } });
  }
}
