import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { cancelQueue } from "./cancelQueue";
import { queueBill } from "./queueBill";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/legislature/commands/validateStateBillProvisions", () => ({
  validateStateBillProvisions: async () => ({
    ok: true,
    provisions: [],
    influenceProvisionCount: 0,
  }),
}));
function world() {
  const f = createTransactionalMemoryDb(),
    actor = new ObjectId(),
    npp = new ObjectId(),
    id = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 1 }]);
  f.memory.seed("characters", [{ _id: actor, actions: 20, nationalInfluence: 6 }]);
  f.memory.seed("npps", [{ _id: npp, name: "Delegate", party: "1" }]);
  f.memory.seed("electedOfficials", [
    { _id: new ObjectId(), nppId: npp, officeType: "stateSenate", state: "TX" },
  ]);
  return { ...f, actor, npp, id };
}
describe("queued bill payment and cancellation", () => {
  it("rolls back a landed refund and pays a concurrent cancellation once", async () => {
    const f = world();
    f.memory.seed("governorLegislationQueue", [
      {
        _id: f.id,
        status: "pending",
        governorCharacterId: f.actor,
        proposalActionCost: 10,
        proposalNpiCost: 3,
      },
    ]);
    const fault = withInjectedCrash(f.memory, {
      collection: "characters",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(cancelQueue(fault.db, f.id)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("characters").docs[0].actions).toBe(20);
    expect(f.memory.collection("governorLegislationQueue").docs[0].status).toBe("pending");
    const results = await Promise.all([cancelQueue(f.db, f.id), cancelQueue(f.db, f.id)]);
    expect(results.filter((row) => row.status === 200)).toHaveLength(1);
    expect(f.memory.collection("characters").docs[0]).toMatchObject({
      actions: 30,
      nationalInfluence: 9,
    });
  });
  it("rolls back prepaid actions after the queue insertion lands", async () => {
    const f = world(),
      input = {
        countryId: "US" as const,
        stateId: "TX",
        character: { _id: f.actor, name: "Governor", party: "1" },
        targetNppId: f.npp,
        title: "Bill",
        summary: "Summary",
      };
    const fault = withInjectedCrash(f.memory, {
      collection: "governorLegislationQueue",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(queueBill(fault.db, input)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("characters").docs[0].actions).toBe(20);
    const results = await Promise.all([queueBill(f.db, input), queueBill(f.db, input)]);
    expect(results.filter((row) => row.status === 200)).toHaveLength(1);
    expect(f.memory.collection("governorLegislationQueue").docs).toHaveLength(1);
  });
});
