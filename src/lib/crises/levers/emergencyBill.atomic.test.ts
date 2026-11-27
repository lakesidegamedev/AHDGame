import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import {
  registerCrisisDefinition,
  resetCrisisV2RegistryForTests,
} from "@/lib/turn/crisisV2/registry";
import { leverActionCost } from "@/lib/crises/v2/leverActions";
import { processCrisisEmergencyBills } from "./emergencyBill";
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
const crisisId = new ObjectId(),
  holder = new ObjectId(),
  billId = new ObjectId();
beforeEach(() => {
  resetCrisisV2RegistryForTests();
  const def = makeDefinition();
  def.levers = def.levers.map((l) =>
    l.id === "relief-bill" ? { ...l, cost: { politicalCapital: 5 } } : l
  );
  registerCrisisDefinition(def);
});
function fixture(status = "signed") {
  const f = createTransactionalMemoryDb();
  f.memory.seed("characters", [{ _id: holder, actions: 20, cash: 1000 }]);
  f.memory.seed("crises", [
    {
      _id: crisisId,
      status: "active",
      scope: "country",
      countryIds: ["US"],
      regionIds: [],
      v2: { ...createCrisisInstance(makeDefinition(), 0), stage: "peak", severity: 70 },
    },
  ]);
  f.memory.seed("bills", [
    {
      _id: billId,
      status,
      countryId: "US",
      crisisEmergency: { crisisId, leverId: "relief-bill", holderId: holder },
    },
  ]);
  return f;
}
describe("emergency bill outcome atomicity", () => {
  it.each([
    { collection: "bills", op: "updateOne" as const },
    { collection: "crises", op: "updateOne" as const },
    { collection: "crisisLeverUses", op: "insertOne" as const },
    { collection: "crisisLeverUses", op: "updateOne" as const },
  ])("a landed $collection/$op interruption preserves an unpaid retryable bill", async (target) => {
    const { db, memory } = fixture();
    const fault = withInjectedCrash(memory, { ...target, onCall: 1, afterWrite: true });
    await expect(processCrisisEmergencyBills(fault.db, 100)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(
      (await db.collection("bills").findOne({}))?.crisisEmergency.recordedTurn
    ).toBeUndefined();
    expect((await db.collection("characters").findOne({}))?.actions).toBe(20);
    expect(await db.collection("crisisLeverUses").countDocuments({})).toBe(0);
    expect(await processCrisisEmergencyBills(db, 100)).toEqual({ passed: 1, failed: 0 });
    expect(await processCrisisEmergencyBills(db, 100)).toEqual({ passed: 0, failed: 0 });
    expect((await db.collection("characters").findOne({}))?.actions).toBe(20 - leverActionCost(5));
    expect((await db.collection("characters").findOne({}))?.cash).toBe(1000);
  });
  it("an unfunded bill stays pending and overlapping retries fund it only once", async () => {
    const { db } = fixture();
    await db.collection("characters").updateOne({}, { $set: { actions: 0 } });
    expect(await processCrisisEmergencyBills(db, 100)).toEqual({ passed: 0, failed: 0 });
    expect(
      (await db.collection("bills").findOne({}))?.crisisEmergency.recordedTurn
    ).toBeUndefined();
    await db.collection("characters").updateOne({}, { $set: { actions: 20 } });
    const results = await Promise.all([
      processCrisisEmergencyBills(db, 101),
      processCrisisEmergencyBills(db, 101),
    ]);
    expect(results.reduce((sum, r) => sum + r.passed, 0)).toBe(1);
    expect(await db.collection("crisisLeverUses").countDocuments({ chargeState: "charged" })).toBe(
      1
    );
  });
  it("a failed bill's history and marker roll back together", async () => {
    const { db, memory } = fixture("failed");
    const fault = withInjectedCrash(memory, {
      collection: "crises",
      op: "updateOne" as const,
      onCall: 2,
      afterWrite: true,
    });
    await expect(processCrisisEmergencyBills(fault.db, 100)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(
      (await db.collection("bills").findOne({}))?.crisisEmergency.recordedTurn
    ).toBeUndefined();
    await processCrisisEmergencyBills(db, 100);
    await processCrisisEmergencyBills(db, 101);
    expect((await db.collection("crises").findOne({}))?.v2.ledger).toHaveLength(1);
  });
});
