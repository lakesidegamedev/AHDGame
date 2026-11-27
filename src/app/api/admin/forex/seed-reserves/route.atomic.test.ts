import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn(async () => {}) }));
const actor = new ObjectId();
let fixture: ReturnType<typeof createTransactionalMemoryDb>;
beforeEach(async () => {
  fixture = createTransactionalMemoryDb();
  fixture.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 10,
      isProcessing: false,
      preset: "2027-default",
      worldEpochId: "test",
    },
  ]);
  fixture.memory.seed("users", [{ _id: actor, role: "admin", isAdmin: true }]);
  fixture.memory.seed("centralBanks", [{ _id: "US", countryId: "US", reserveBalance: 0 }]);
  const { requireAdmin } = await import("@/lib/api/requireAdmin");
  vi.mocked(requireAdmin).mockResolvedValue({
    ok: true,
    admin: { userId: actor.toString(), username: "test-admin" },
  } as never);
});
async function run(db = fixture.db) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  return POST();
}
it.each(["centralBanks", "actionAuditLog"])(
  "a landed %s failure cannot leave an unaudited grant",
  async (collection) => {
    const fault = withInjectedCrash(fixture.memory, { collection, onCall: 1, afterWrite: true });
    expect((await run(fault.db)).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(fixture.memory.collection("centralBanks").docs[0].reserveBalance).toBe(0);
    expect((await run(fault.db)).status).toBe(200);
    expect(fixture.memory.collection("centralBanks").docs[0].reserveBalance).toBe(5000000000);
    expect((await run()).status).toBe(200);
    expect(fixture.memory.collection("centralBanks").docs[0].reserveBalance).toBe(5000000000);
  }
);
it("incoming foreign fees use the historical cross rate in the reserve estimate", async () => {
  fixture.memory.seed(
    "tradeHistory",
    Array.from({ length: 48 }, () => ({
      _id: new ObjectId(),
      fromCurrency: "JPY",
      toCurrency: "USD",
      spread: 1000000000000,
      rate: 0.01,
      turn: 9,
    }))
  );
  expect((await run()).status).toBe(200);
  expect(fixture.memory.collection("centralBanks").docs[0].reserveBalance).toBe(2880000000000);
});
it("does not replace an intervening reserve credit with a stale seed amount", async () => {
  const collection = fixture.memory.collection("centralBanks"),
    original = collection.updateOne.bind(collection);
  vi.spyOn(collection, "updateOne").mockImplementationOnce(async (filter, change) => {
    await original({ _id: "US" }, { $inc: { reserveBalance: 30 } });
    return original(filter, change);
  });
  const response = await run();
  expect(response.status).toBe(200);
  expect(fixture.memory.collection("centralBanks").docs[0].reserveBalance).toBe(30);
  expect((await response.json()).seeded).toEqual({});
});
it("refuses while turn processing owns the world", async () => {
  fixture.memory.collection("gameState").docs[0].isProcessing = true;
  expect((await run()).status).toBe(409);
  expect(fixture.memory.collection("centralBanks").docs[0].reserveBalance).toBe(0);
});
