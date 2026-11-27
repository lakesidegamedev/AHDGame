import { getCharactersCollection } from "@/lib/db/collections/characters";
import type { Db, ObjectId } from "mongodb";
import { isResolvedBillStatus } from "@/lib/crises/aidFinalize";
import { LEDGER_LIMIT } from "@/lib/crises/v2/accountability";
import type { AccountabilityEntry } from "@/lib/crises/v2/types";
import type { Bill } from "@/lib/db/types";
import { proposeCrisisEmergencyBill } from "@/lib/legislature/commands/proposeCrisisEmergencyBill";
import { logger } from "@/lib/observability/logger";
import {
  checkLeverEligibility,
  commitLeverUse,
  loadLiveCrisis,
  withLeverTransaction,
  abortLeverTransaction,
  fail,
  type LeverResult,
} from "./leverCommand";
import { resolveCrisisDefinition } from "@/lib/turn/crisisV2/ensureContent";
import { billsCollection } from "@/lib/db/repositories/bills";
import { crisisLeverUsesCollection } from "@/lib/db/repositories/crisisLeverUses";
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

/** A bill's terminal marker and funded response share the same commit. */
async function recordEmergencyBillOutcome(db: Db, bill: Bill, turn: number) {
  return withLeverTransaction(db, async (db) => {
    const marker = bill.crisisEmergency;
    if (!marker) return { ok: true, passed: 0, failed: 0 };
    const outcome = isResolvedBillStatus(bill.status);
    if (!outcome) return { ok: true, passed: 0, failed: 0 };
    const claimed = await billsCollection(db).updateOne(
      { _id: bill._id, status: bill.status, "crisisEmergency.recordedTurn": { $exists: false } },
      { $set: { "crisisEmergency.recordedTurn": turn } }
    );
    if (claimed.matchedCount !== 1) return { ok: true, passed: 0, failed: 0 };
    const crisis = await loadLiveCrisis(db, marker.crisisId);
    if (!crisis || crisis.v2.stage === "resolved") return { ok: true, passed: 0, failed: 0 };
    const live = await crisesCollection(db).updateOne(
      { _id: crisis._id, status: "active", "v2.stage": crisis.v2.stage },
      { $set: { updatedAt: new Date() } }
    );
    if (live.matchedCount !== 1)
      abortLeverTransaction(fail("resolved", "The crisis changed before the response"));
    if (outcome === "passed") {
      const lever = resolveCrisisDefinition(crisis.v2.definitionId)?.levers.find(
        (candidate) => candidate.id === marker.leverId
      );
      if (!lever)
        abortLeverTransaction(
          fail("not_found", "The emergency response definition is unavailable")
        );
      const original = await crisisLeverUsesCollection(db).findOne(
        { billId: bill._id, chargeState: "charged" },
        { projection: { _id: 1 } }
      );
      if (!original) {
        const result = await commitLeverUse(db, {
          crisis,
          lever,
          holderId: marker.holderId,
          countryId: bill.countryId,
          billId: bill._id,
          intensity: 1,
          turn,
        });
        if (!result.ok) abortLeverTransaction(result);
      }
      return { ok: true, passed: 1, failed: 0 };
    }
    const row = inactionRow(crisis, bill, turn);
    if (row)
      await crisesCollection(db).updateOne(
        { _id: crisis._id },
        {
          $push: { "v2.ledger": { $each: [row], $slice: -LEDGER_LIMIT } },
        }
      );
    return { ok: true, passed: 0, failed: row ? 1 : 0 };
  });
}

/** Isolate each appropriation so an unfunded response does not block other bills. */
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
  const counts = { passed: 0, failed: 0 };
  for (const bill of bills) {
    if (!isResolvedBillStatus(bill.status)) continue;
    const result = await recordEmergencyBillOutcome(db, bill, turn);
    if (result.ok) {
      counts.passed += result.passed;
      counts.failed += result.failed;
    } else
      logger.warn(COMPONENT, "Emergency bill remains pending until its response can be delivered", {
        billId: bill._id.toHexString(),
        code: result.code,
      });
  }
  return counts;
}
