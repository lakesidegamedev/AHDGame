import type { Db, ObjectId } from "mongodb";
import { isResolvedBillStatus } from "@/lib/crises/aidFinalize";
import { LEDGER_LIMIT } from "@/lib/crises/v2/accountability";
import type { AccountabilityEntry } from "@/lib/crises/v2/types";
import type { Bill } from "@/lib/db/types";
import type { Character } from "@/lib/db/types";
import type { Crisis } from "@/lib/db/types/crisis";
import { proposeCrisisEmergencyBill } from "@/lib/legislature/commands/proposeCrisisEmergencyBill";
import { logger } from "@/lib/observability/logger";
import {
  checkLeverEligibility,
  commitLeverUse,
  loadLiveCrisis,
  fail,
  type LeverResult,
} from "./leverCommand";
import { getCrisisDefinition } from "@/lib/turn/crisisV2/registry";

const COMPONENT = "crisisEmergencyBill";

export interface EmergencyBillInput {
  crisisId: ObjectId;
  leverId: string;
  characterId: ObjectId;
}

/**
 * A legislator raises the emergency bill behind a legislature lever. Nothing is
 * charged here: the lever's cost is the appropriation, spent only if the bill
 * passes.
 */
export async function proposeEmergencyBill(
  db: Db,
  input: EmergencyBillInput
): Promise<LeverResult<{ billId: ObjectId }>> {
  const eligible = await checkLeverEligibility(db, input);
  if (!eligible.ok) return eligible;
  const { crisis, def, lever, actor } = eligible.context;
  if (lever.role !== "legislature") {
    return fail("wrong_role", "This response is not passed by the legislature");
  }
  if (!actor.countryId) return fail("out_of_jurisdiction", "You have no legislature to petition");

  const pending = await db.collection<Bill>("bills").findOne(
    {
      "crisisEmergency.crisisId": crisis._id,
      "crisisEmergency.leverId": lever.id,
      "crisisEmergency.recordedTurn": { $exists: false },
    },
    { projection: { _id: 1 } }
  );
  if (pending)
    return fail(
      "duplicate",
      "An emergency bill for this response is already before the legislature"
    );

  const sponsor = await db
    .collection<Pick<Character, "name" | "party">>("characters")
    .findOne({ _id: actor._id }, { projection: { name: 1, party: 1 } });
  const billId = await proposeCrisisEmergencyBill(db, {
    countryId: actor.countryId as never,
    crisisId: crisis._id,
    leverId: lever.id,
    sponsorId: actor._id,
    sponsorName: sponsor?.name ?? "A legislator",
    sponsorParty: sponsor?.party ?? undefined,
    title: `Emergency measure: ${lever.label}`,
    summary: `Fast-track response to ${def.label}.`,
  });
  return { ok: true, billId };
}

async function recordFailedBill(db: Db, bill: Bill, turn: number): Promise<void> {
  const marker = bill.crisisEmergency;
  if (!marker) return;
  const crisis = await loadLiveCrisis(db, marker.crisisId);
  if (!crisis || crisis.v2.stage === "resolved") return;
  const row: AccountabilityEntry = {
    turn,
    stage: crisis.v2.stage,
    role: "legislature",
    holderId: marker.holderId.toString(),
    leverId: null,
    cost: {},
    mitigation: 0,
    severity: crisis.v2.severity,
  };
  await db
    .collection<Crisis>("crises")
    .updateOne(
      { _id: crisis._id },
      { $push: { "v2.ledger": { $each: [row], $slice: -LEDGER_LIMIT } } }
    );
}

async function recordPassedBill(db: Db, bill: Bill, turn: number): Promise<void> {
  const marker = bill.crisisEmergency;
  if (!marker) return;
  const crisis = await loadLiveCrisis(db, marker.crisisId);
  const lever = crisis
    ? getCrisisDefinition(crisis.v2.definitionId)?.levers.find((l) => l.id === marker.leverId)
    : undefined;
  if (!crisis || !lever || crisis.v2.stage === "resolved") return;
  const result = await commitLeverUse(db, {
    crisis,
    lever,
    holderId: marker.holderId,
    countryId: bill.countryId,
    billId: bill._id,
    intensity: 1,
    turn,
  });
  if (!result.ok && result.code !== "duplicate") {
    logger.warn(COMPONENT, "passed emergency bill could not be charged", {
      billId: bill._id.toString(),
      code: result.code,
    });
  }
}

/**
 * Records the outcome of every resolved emergency bill exactly once: a passed
 * bill becomes a charged lever use for the legislature role, a failed one an
 * inaction row. Runs before the crisis step so the same turn sees the result.
 */
export async function processCrisisEmergencyBills(
  db: Db,
  turn: number
): Promise<{ passed: number; failed: number }> {
  const bills = await db
    .collection<Bill>("bills")
    .find({
      "crisisEmergency.crisisId": { $exists: true },
      "crisisEmergency.recordedTurn": { $exists: false },
    })
    .toArray();
  const counts = { passed: 0, failed: 0 };
  for (const bill of bills) {
    const outcome = isResolvedBillStatus(bill.status);
    if (!outcome) continue;
    try {
      const claim = await db
        .collection<Bill>("bills")
        .updateOne(
          { _id: bill._id, "crisisEmergency.recordedTurn": { $exists: false } },
          { $set: { "crisisEmergency.recordedTurn": turn } }
        );
      if (claim.modifiedCount === 0) continue;
      if (outcome === "passed") {
        await recordPassedBill(db, bill, turn);
        counts.passed += 1;
      } else {
        await recordFailedBill(db, bill, turn);
        counts.failed += 1;
      }
    } catch (error) {
      logger.error(COMPONENT, "recording emergency bill outcome failed", error, {
        billId: bill._id.toString(),
      });
    }
  }
  return counts;
}
