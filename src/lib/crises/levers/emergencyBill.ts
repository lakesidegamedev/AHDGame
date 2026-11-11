import { getCharactersCollection } from "@/lib/db/collections/characters";
import type { AnyBulkWriteOperation, Db, ObjectId } from "mongodb";
import { isResolvedBillStatus } from "@/lib/crises/aidFinalize";
import { LEDGER_LIMIT } from "@/lib/crises/v2/accountability";
import type { AccountabilityEntry } from "@/lib/crises/v2/types";
import type { Bill } from "@/lib/db/types";
import type { Crisis } from "@/lib/db/types/crisis";
import { proposeCrisisEmergencyBill } from "@/lib/legislature/commands/proposeCrisisEmergencyBill";
import { logger } from "@/lib/observability/logger";
import {
  checkLeverEligibility,
  commitLeverUse,
  loadLiveCrisis,
  loadLiveCrises,
  fail,
  type LeverResult,
} from "./leverCommand";
import { resolveCrisisDefinition } from "@/lib/turn/crisisV2/ensureContent";
import { billsCollection } from "@/lib/db/repositories/bills";
import { crisesCollection } from "@/lib/db/repositories/crises";

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

  const pending = await billsCollection(db).findOne(
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

  const sponsor = await (
    await getCharactersCollection(db)
  ).findOne({ _id: actor._id }, { projection: { name: 1, party: 1 } });
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

type LiveCrisis = NonNullable<Awaited<ReturnType<typeof loadLiveCrisis>>>;

function inactionRow(crisis: LiveCrisis, bill: Bill, turn: number): AccountabilityEntry | null {
  const marker = bill.crisisEmergency;
  if (!marker || crisis.v2.stage === "resolved") return null;
  return {
    turn,
    stage: crisis.v2.stage,
    role: "legislature",
    holderId: marker.holderId.toString(),
    leverId: null,
    cost: {},
    mitigation: 0,
    severity: crisis.v2.severity,
  };
}

async function recordPassedBill(db: Db, bill: Bill, crisis: LiveCrisis, turn: number) {
  const marker = bill.crisisEmergency;
  const lever = resolveCrisisDefinition(crisis.v2.definitionId)?.levers.find(
    (candidate) => candidate.id === marker?.leverId
  );
  if (!marker || !lever || crisis.v2.stage === "resolved") return;
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
  const bills = await billsCollection(db)
    .find({
      "crisisEmergency.crisisId": { $exists: true },
      "crisisEmergency.recordedTurn": { $exists: false },
    })
    .toArray();
  const resolved = bills.flatMap((bill) => {
    const outcome = isResolvedBillStatus(bill.status);
    return outcome ? [{ bill, outcome }] : [];
  });
  const counts = { passed: 0, failed: 0 };
  if (resolved.length === 0) return counts;

  // Claim every outcome in one write first, so a retry never records one twice.
  await billsCollection(db).updateMany(
    {
      _id: { $in: resolved.map(({ bill }) => bill._id) },
      "crisisEmergency.recordedTurn": { $exists: false },
    },
    { $set: { "crisisEmergency.recordedTurn": turn } }
  );

  const crisisIds = [
    ...new Set(resolved.flatMap(({ bill }) => bill.crisisEmergency?.crisisId ?? [])),
  ];
  const crises = new Map(
    (await loadLiveCrises(db, crisisIds)).map((crisis) => [crisis._id.toString(), crisis])
  );

  const inaction: AnyBulkWriteOperation<Crisis>[] = [];
  for (const { bill, outcome } of resolved) {
    const crisis = crises.get(bill.crisisEmergency?.crisisId.toString() ?? "");
    if (!crisis) continue;
    try {
      if (outcome === "passed") {
        await recordPassedBill(db, bill, crisis, turn);
        counts.passed += 1;
      } else {
        const row = inactionRow(crisis, bill, turn);
        if (!row) continue;
        inaction.push({
          updateOne: {
            filter: { _id: crisis._id },
            update: { $push: { "v2.ledger": { $each: [row], $slice: -LEDGER_LIMIT } } },
          },
        });
        counts.failed += 1;
      }
    } catch (error) {
      logger.error(COMPONENT, "recording emergency bill outcome failed", error, {
        billId: bill._id.toString(),
      });
    }
  }
  if (inaction.length > 0) {
    try {
      await crisesCollection(db).bulkWrite(inaction, { ordered: false });
    } catch (error) {
      logger.error(COMPONENT, "recording failed emergency bills failed", error);
    }
  }
  return counts;
}
