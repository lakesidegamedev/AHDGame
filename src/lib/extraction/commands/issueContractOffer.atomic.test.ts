import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { issueContractOffer } from "./issueContractOffer";
vi.mock("@/lib/notifications", () => ({ createNotifications: async () => {} }));
const corp = new ObjectId(),
  actor = { characterId: new ObjectId(), isAdmin: true };
const input = {
  countryId: "US",
  stateId: "TX",
  corporationId: corp.toString(),
  resource: "iron",
  share: 0.5,
  royaltyRatePerTurn: 10,
  termTurns: 10,
  signingFeeAnchor: 50,
} as const;
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("stateResourceCapacity", [
    { _id: "TX", stateId: "TX", countryId: "US", resources: { iron: 1000 } },
  ]);
  f.memory.seed("corporations", [{ _id: corp, type: "extraction", liquidCapital: 1000 }]);
  f.memory.seed("corporateSectors", [{ _id: new ObjectId(), corporationId: corp, stateId: "TX" }]);
  return f;
}
it("parallel offers cannot reserve more than the shared capacity cap", async () => {
  const { db, memory } = fixture();
  const result = await Promise.all([
    issueContractOffer(db, input, actor, 99, new Date()),
    issueContractOffer(db, input, actor, 99, new Date()),
  ]);
  expect(result.map((row) => row.ok).sort()).toEqual([false, true]);
  expect(memory.collection("extractionContracts").docs).toHaveLength(1);
  expect(memory.collection("extractionContracts").docs[0].grantedTurn).toBe(100);
  expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
});
it("a landed insert rolls back its reservation and permits one clean retry", async () => {
  const { memory } = fixture();
  const fault = withInjectedCrash(memory, {
    collection: "extractionContracts",
    op: "insertOne",
    onCall: 1,
    afterWrite: true,
  });
  await expect(issueContractOffer(fault.db, input, actor, 100, new Date())).rejects.toThrow();
  expect(fault.crashed).toBe(true);
  expect(memory.collection("extractionContracts").docs).toHaveLength(0);
  expect((await issueContractOffer(fault.db, input, actor, 100, new Date())).ok).toBe(true);
});
it("negative quantities and turn ownership cannot publish an offer", async () => {
  const { db, memory } = fixture();
  expect((await issueContractOffer(db, { ...input, share: -0.5 }, actor, 100, new Date())).ok).toBe(
    false
  );
  memory.collection("gameState").docs[0].isProcessing = true;
  expect((await issueContractOffer(db, input, actor, 100, new Date())).ok).toBe(false);
  expect(memory.collection("extractionContracts").docs).toHaveLength(0);
});
