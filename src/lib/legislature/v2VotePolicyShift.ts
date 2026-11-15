import type { Db } from "mongodb";
import type { PolicyShiftLedgerEntry } from "@/lib/db/types";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import {
  applyBillVotePolicyShift,
  type ApplyBillVotePolicyShiftInput,
  type BillVote,
} from "@/lib/policyShift";
import { charactersCollection } from "@/lib/db/repositories/characters";

/** The character movement and bill ledger commit together, using fresh positions. */
export async function applyV2BillVotePolicyShift(
  db: Db,
  input: ApplyBillVotePolicyShiftInput,
  voteField: "votes" | "otherChamberVotes" | "vetoOverrideVotes" | "overrideVotes"
): Promise<void> {
  if (!input.provisions.length) return;
  const key = input.characterId.toString();
  const updatedAt = new Date();
  await runRequiredTransaction(async (session) => {
    const bill = await db
      .collection<{
        votes?: Record<string, BillVote>;
        otherChamberVotes?: Record<string, BillVote>;
        vetoOverrideVotes?: Record<string, BillVote>;
        overrideVotes?: Record<string, BillVote>;
        policyShiftLedger?: Record<string, PolicyShiftLedgerEntry>;
      }>(input.collection)
      .findOne(
        { _id: input.billId },
        {
          projection: { [`${voteField}.${key}`]: 1, [`policyShiftLedger.${key}`]: 1 },
          session,
        }
      );
    // A later click may have superseded this request while it waited for Mongo.
    if (bill?.[voteField]?.[key] !== input.vote) return;
    const character = await charactersCollection(db).findOne(
      { _id: input.characterId },
      { projection: { policies: 1 }, session }
    );
    if (!character) return;
    await applyBillVotePolicyShift(db, {
      ...input,
      currentPolicies: character.policies,
      ledgerEntry: bill.policyShiftLedger?.[key],
      session,
      updatedAt,
    });
  });
}
