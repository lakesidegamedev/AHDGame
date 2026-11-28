import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { takeSupplyListing } from "./takeSupplyListing";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("./acquisitions/controllerTransferBarrier", () => ({
  controllerTransferBarrierError: async () => null,
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/corporations/supplyExchange/guards", () => ({
  checkSupplyAgreementReach: async () => null,
  checkSupplyContractParties: async () => null,
  requireSupplyExchangeAccess: async () => null,
}));
vi.mock("@/lib/corporations/supplyExchange/notifications", () => ({
  notifySupplyAgreementEvent: async () => {},
}));
vi.mock("@/lib/corporations/commands/supplyAgreements", async (original) => ({
  ...(await original<typeof import("@/lib/corporations/commands/supplyAgreements")>()),
  validateCapacity: async () => ({ volumeCapValidated: true, currentTurn: 100, currentYear: 2027 }),
}));
const owner = new ObjectId(),
  supplierId = new ObjectId(),
  buyerId = new ObjectId(),
  requestId = "64bbca8a-c752-4c86-8554-48816c02da09";
let fixture: ReturnType<typeof createTransactionalMemoryDb>;
beforeEach(async () => {
  fixture = createTransactionalMemoryDb();
  fixture.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, isProcessing: false, worldEpochId: "test" },
  ]);
  fixture.memory.seed("corporations", [
    { _id: supplierId, name: "Supplier", countryId: "US", userId: new ObjectId() },
    { _id: buyerId, name: "Buyer", countryId: "US", userId: owner },
  ]);
  fixture.memory.seed("supplyListings", [
    {
      _id: "supplier:0",
      corporationId: supplierId,
      side: "sell",
      commodity: "steel",
      volumeCap: 100,
      pricePremium: 0.1,
      expiresAtTurn: 200,
      aiListed: true,
    },
  ]);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: owner.toString() },
  } as never);
});
async function run(db: Db, id = requestId, volume = 40) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  return takeSupplyListing(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, listingId: "supplier:0", volume }),
    }),
    buyerId.toString()
  );
}
it.each(["supplyListings", "supplyAgreements", "bankMoneyMoves"])(
  "rolls back a landed %s write and retries one contract",
  async (collection) => {
    const fault = withInjectedCrash(fixture.memory, { collection, onCall: 1, afterWrite: true });
    expect((await run(fault.db)).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(fixture.memory.collection("supplyListings").docs[0].volumeCap).toBe(100);
    expect(fixture.memory.collection("supplyAgreements").docs).toHaveLength(0);
    expect((await run(fault.db)).status).toBe(200);
    expect(fixture.memory.collection("supplyListings").docs[0].volumeCap).toBe(60);
    expect(fixture.memory.collection("supplyAgreements").docs).toHaveLength(1);
  }
);
it("replays the original accepted result when a response was lost", async () => {
  const first = await (await run(fixture.db)).json();
  await run(fixture.db, "6381b964-a166-47c0-857a-2951044f259c", 10);
  const repeat = await (await run(fixture.db)).json();
  expect(repeat).toEqual(first);
  expect(fixture.memory.collection("supplyListings").docs[0].volumeCap).toBe(50);
  expect(fixture.memory.collection("supplyAgreements").docs).toHaveLength(2);
});
it("overlapping retries publish one original contract and reject changed request details", async () => {
  const results = await Promise.all([run(fixture.db), run(fixture.db)]);
  expect(await results[0].json()).toEqual(await results[1].json());
  expect(fixture.memory.collection("supplyAgreements").docs).toHaveLength(1);
  expect((await run(fixture.db, requestId, 30)).status).toBe(409);
  expect(fixture.memory.collection("supplyListings").docs[0].volumeCap).toBe(60);
});
