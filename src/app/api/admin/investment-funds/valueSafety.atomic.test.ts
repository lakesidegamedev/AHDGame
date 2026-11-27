import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST as inject } from "./inject-capital-all/route";
import { DELETE as clear } from "./clear/route";
import { getDb } from "@/lib/mongodb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: async () => ({ ok: true, admin: { username: "synthetic-admin" } }),
}));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn(async () => {}) }));
const fundId = new ObjectId(),
  corporationId = new ObjectId(),
  bondId = new ObjectId();
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 10,
      isProcessing: false,
      worldEpochId: "synthetic",
      forexEnabled: false,
    },
  ]);
  f.memory.seed("indexFunds", [
    {
      _id: fundId,
      slug: "synthetic",
      name: "Synthetic fund",
      tickerSymbol: "SYN",
      anchorCurrencyCode: "USD",
      cashAnchor: 500,
      holdings: [],
      unitSupply: 100,
      quotedNav: 10,
      reserveUnits: 100,
      backingRatio: 0.25,
    },
  ]);
  f.memory.seed("indexFundRedemptionQueue", [
    {
      _id: new ObjectId(),
      fundId,
      status: "queued",
      unitsBurnedAtRequest: true,
      units: 100,
      requestedNavAnchor: 10,
    },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corporationId,
      publicFloat: 20,
      shareholders: [
        { fundId, shares: 30, avgCostPerShare: 2 },
        { characterId: new ObjectId(), shares: 50 },
      ],
    },
  ]);
  f.memory.seed("bonds", [{ _id: bondId, publicFloat: 5, holders: [{ fundId, units: 10 }] }]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  return f;
}
function request() {
  return new Request("http://localhost/api/admin/investment-funds/inject-capital-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}
describe("admin fund value operations", () => {
  beforeEach(() => vi.clearAllMocks());
  it("values queued units at NAV and injects only the missing backing", async () => {
    const { db, memory } = fixture();
    memory.seed("bonds", []);
    const reply = await inject(request());
    expect(reply.status).toBe(200);
    expect((await reply.json()).results[0].injected).toBe(1500);
    expect((await db.collection("indexFunds").findOne({ _id: fundId }))?.cashAnchor).toBe(2000);
    expect((await (await inject(request())).json()).fundsInjected).toBe(0);
  });
  it.each(["indexFunds", "indexFundTransactions"])(
    "rolls back a landed top-up %s failure",
    async (collection) => {
      const { db, memory } = fixture();
      memory.seed("bonds", []);
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      vi.mocked(getDb).mockResolvedValue(fault.db);
      expect((await inject(request())).status).toBeGreaterThanOrEqual(500);
      expect(fault.crashed).toBe(true);
      expect((await db.collection("indexFunds").findOne({ _id: fundId }))?.cashAnchor).toBe(500);
      vi.mocked(getDb).mockResolvedValue(db);
      expect((await inject(request())).status).toBe(200);
    }
  );
  it.each(["corporations", "bonds", "indexFunds", "indexFundRedemptionQueue"])(
    "rolls back a landed clear %s failure",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      vi.mocked(getDb).mockResolvedValue(fault.db);
      expect((await clear()).status).toBeGreaterThanOrEqual(500);
      expect(fault.crashed).toBe(true);
      expect(
        (await db.collection("corporations").findOne({ _id: corporationId }))?.publicFloat
      ).toBe(20);
      expect((await db.collection("bonds").findOne({ _id: bondId }))?.publicFloat).toBe(5);
      expect(await db.collection("indexFunds").countDocuments({})).toBe(1);
    }
  );
  it("parallel clears release ownership once, and turn processing refuses both commands", async () => {
    const { db, memory } = fixture();
    const replies = await Promise.all([clear(), clear()]);
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    expect((await db.collection("corporations").findOne({ _id: corporationId }))?.publicFloat).toBe(
      50
    );
    expect((await db.collection("bonds").findOne({ _id: bondId }))?.publicFloat).toBe(15);
    memory.collection("gameState").docs[0].isProcessing = true;
    expect((await clear()).status).toBe(409);
    expect((await inject(request())).status).toBe(409);
  });
});
