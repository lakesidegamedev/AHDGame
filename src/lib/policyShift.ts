import type { ClientSession, Db, ObjectId } from "mongodb";
import type { AxisPositions, PolicyShiftLedgerEntry } from "@/lib/db/types";
import { clamp } from "@/lib/numeric/rules";
import { snapToPositionGrid } from "@/lib/utils/politics";
import {
  billPositionTargets,
  computeVoteShift,
  type BillVote,
} from "@/lib/legislature/rules/votePolicyShift";
import { charactersCollection } from "@/lib/db/repositories/characters";
export * from "@/lib/legislature/rules/votePolicyShift";
const POSITION_MIN = -5;
const POSITION_MAX = 5;
function onGrid(value: number): number {
  return Number(snapToPositionGrid(value).toFixed(2));
}

export interface ApplyBillVotePolicyShiftInput {
  collection: "bills" | "stateBills";
  billId: ObjectId;
  characterId: ObjectId;
  provisions: ReadonlyArray<{ economic?: number; social?: number; includeNeutral?: boolean }>;
  vote: BillVote;
  currentPolicies: AxisPositions;
  ledgerEntry: PolicyShiftLedgerEntry | undefined;
  session?: ClientSession;
  updatedAt?: Date;
}

/**
 * Applies a bill vote to a character's positions and records the movement on
 * the bill's ledger.
 *
 * The delta is always computed from the ledger baseline (the position held
 * before this bill first moved the voter) and only the DIFFERENCE from what was
 * previously applied is added to the current position, so shifts from other
 * bills in between are preserved and the net from this bill never exceeds one
 * step. Abstaining after an Aye or Nay reverts what that vote applied.
 */
export async function applyBillVotePolicyShift(
  db: Db,
  {
    collection,
    billId,
    characterId,
    provisions,
    vote,
    currentPolicies,
    ledgerEntry,
    session,
    updatedAt = new Date(),
  }: ApplyBillVotePolicyShiftInput
): Promise<void> {
  // The caller read the bill before recording the vote; a vote that landed in
  // between may already have written an entry. Re-read at write time so two
  // rapid votes cannot both start from "no entry" and each apply a full step.
  const key = `policyShiftLedger.${characterId.toString()}`;
  const fresh = await db
    .collection<{ policyShiftLedger?: Record<string, PolicyShiftLedgerEntry> }>(collection)
    .findOne({ _id: billId }, { projection: { [key]: 1 }, ...(session ? { session } : {}) });
  const entry = fresh ? fresh.policyShiftLedger?.[characterId.toString()] : ledgerEntry;

  if (vote === "abstain" && !entry) return;

  const baseline = entry?.baseline ?? { ...currentPolicies };
  const applied = entry?.applied ?? { economic: 0, social: 0 };
  const next = computeVoteShift(baseline, billPositionTargets(provisions), vote);
  const changeEconomic = Number((next.economic - applied.economic).toFixed(2));
  const changeSocial = Number((next.social - applied.social).toFixed(2));

  if (changeEconomic === 0 && changeSocial === 0 && entry) return;

  if (changeEconomic !== 0 || changeSocial !== 0) {
    await charactersCollection(db).updateOne(
      { _id: characterId },
      {
        $set: {
          "policies.economic": onGrid(
            clamp(currentPolicies.economic + changeEconomic, POSITION_MIN, POSITION_MAX)
          ),
          "policies.social": onGrid(
            clamp(currentPolicies.social + changeSocial, POSITION_MIN, POSITION_MAX)
          ),
          updatedAt,
        },
      },
      ...(session ? [{ session }] : [])
    );
  }

  const nextEntry: PolicyShiftLedgerEntry = { baseline, applied: next };
  await db
    .collection(collection)
    .updateOne({ _id: billId }, { $set: { [key]: nextEntry } }, ...(session ? [{ session }] : []));
}
