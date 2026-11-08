import { createHash } from "node:crypto";
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import {
  ELECTION_SHIFT_TURNS,
  boundPartyShift,
  judgeHolders,
  partyElectionPct,
  type HolderVerdict,
} from "@/lib/crises/v2/blame";
import type { CrisisInstance, CrisisRole } from "@/lib/crises/v2/types";
import { getCountryModifiersCollection } from "@/lib/db/collections/countryModifiers";
import type { Character } from "@/lib/db/types";
import type { CountryModifier } from "@/lib/db/types/events";
import type { GovernmentApproval } from "@/lib/db/types/governmentApproval";
import type { StateApprovalHistory } from "@/lib/db/types/stateApproval";

/** Roles whose party carries the electoral credit or blame for how they acted. */
const ELECTORAL_ROLES: ReadonlySet<CrisisRole> = new Set([
  "headOfState",
  "stateGovernor",
  "legislature",
  "partyLeader",
]);

export interface ConsequenceTargets {
  crisisId: ObjectId;
  scope: CrisisInstance["scope"];
  regionIds: readonly string[];
}

export interface ConsequenceResult {
  approvalWrites: number;
  electionShifts: number;
}

function clampedApproval(delta: number) {
  return [
    {
      $set: {
        approvalRating: {
          $max: [0, { $min: [100, { $add: [{ $ifNull: ["$approvalRating", 50] }, delta] }] }],
        },
      },
    },
  ];
}

function shiftId(crisisId: ObjectId, countryId: string, partyId: string, region: string): ObjectId {
  const digest = createHash("sha256")
    .update(`${crisisId.toHexString()}:blame:${countryId}:${partyId}:${region}`)
    .digest("hex");
  return new ObjectId(digest.slice(0, 24));
}

/**
 * Turns the accountability ledger into approval changes for the offices that
 * carry one (national approval for the head of state, state approval for a
 * governor) and into a bounded, expiring vote-share shift for each holder's
 * party in the places the crisis reached. Runs once per crisis; the shift ids
 * are stable so a repeat run overwrites nothing new.
 */
export async function settleCrisisConsequences(
  db: Db,
  instance: Pick<CrisisInstance, "ledger">,
  targets: ConsequenceTargets,
  turn: number
): Promise<ConsequenceResult> {
  const verdicts = judgeHolders(instance.ledger);
  const result: ConsequenceResult = { approvalWrites: 0, electionShifts: 0 };
  if (verdicts.length === 0) return result;

  const holderIds = verdicts
    .filter((v) => ObjectId.isValid(v.holderId))
    .map((v) => new ObjectId(v.holderId));
  const characters = await db
    .collection<Character>("characters")
    .find({ _id: { $in: holderIds } }, { projection: { party: 1, countryId: 1, currentOffice: 1 } })
    .toArray();
  const byId = new Map(characters.map((character) => [character._id.toString(), character]));

  const nationalApproval = new Map<string, number>();
  const stateApproval = new Map<string, { countryId: string; delta: number }>();
  const partyShift = new Map<string, { countryId: string; partyId: string; pct: number }>();

  for (const verdict of verdicts) {
    const character = byId.get(verdict.holderId);
    if (!character?.countryId) continue;
    const countryId = character.countryId as string;

    if (verdict.role === "headOfState") {
      nationalApproval.set(
        countryId,
        (nationalApproval.get(countryId) ?? 0) + verdict.approvalDelta
      );
    } else if (verdict.role === "stateGovernor") {
      const state = (character.currentOffice as { state?: string } | null)?.state;
      if (state) {
        const key = state.toUpperCase();
        const row = stateApproval.get(key) ?? { countryId, delta: 0 };
        row.delta += verdict.approvalDelta;
        stateApproval.set(key, row);
      }
    }

    if (ELECTORAL_ROLES.has(verdict.role) && character.party) {
      const key = `${countryId}|${character.party}`;
      const row = partyShift.get(key) ?? { countryId, partyId: character.party, pct: 0 };
      row.pct += partyElectionPct(verdict.approvalDelta);
      partyShift.set(key, row);
    }
  }

  const approvals = db.collection<GovernmentApproval>("governmentApprovals");
  for (const [countryId, delta] of nationalApproval) {
    if (Math.abs(delta) < 0.01) continue;
    await approvals.updateOne(
      { _id: countryId as GovernmentApproval["_id"] },
      clampedApproval(delta)
    );
    result.approvalWrites += 1;
  }
  const states = db.collection<StateApprovalHistory>("stateApprovalHistory");
  for (const [stateId, { countryId, delta }] of stateApproval) {
    if (Math.abs(delta) < 0.01) continue;
    await states.updateOne({ _id: stateId, countryId: countryId as never }, clampedApproval(delta));
    result.approvalWrites += 1;
  }

  const regionIds =
    targets.scope === "local" || targets.scope === "state" ? [...targets.regionIds] : [];
  const regionKey = regionIds.join(",");
  const ops: AnyBulkWriteOperation<CountryModifier>[] = [];
  for (const { countryId, partyId, pct } of partyShift.values()) {
    const bounded = boundPartyShift(pct);
    if (Math.abs(bounded) < 0.01) continue;
    const doc: CountryModifier = {
      _id: shiftId(targets.crisisId, countryId, partyId, regionKey),
      countryId,
      kind: "crisisBlame",
      partyId,
      regionIds,
      pct: bounded,
      appliedAtTurn: turn,
      expiresAtTurn: turn + ELECTION_SHIFT_TURNS,
      sourceInstanceId: targets.crisisId,
      createdAt: new Date(),
    };
    ops.push({
      updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true },
    });
  }
  if (ops.length > 0) {
    await getCountryModifiersCollection(db).bulkWrite(ops, { ordered: false });
    result.electionShifts = ops.length;
  }
  return result;
}

export type { HolderVerdict };
