import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUserWithCharacter: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/indexFunds/fundTxLog", () => ({ logIndexFundSubscribeActivity: vi.fn() }));
vi.mock("@/lib/indexFunds/playerCommandAudit", () => ({ resumeFundCommandAudit: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/turn/currentTurn", () => ({ getCurrentTurn: async () => 1 }));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb(),
    characterId = new ObjectId(),
    fundId = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 1, isProcessing: false }]);
  f.memory.seed("characters", [
    { _id: characterId, name: "Synthetic investor", countryId: "US", cashOnHand: 100 },
  ]);
  f.memory.seed("indexFunds", [
    {
      _id: fundId,
      slug: "test",
      name: "Synthetic fund",
      status: "active",
      quotedNav: 1,
      anchorCurrencyCode: "USD",
      unitSupply: 7,
      cashAnchor: 7,
    },
  ]);
  f.memory.seed("indexFundPositions", [
    {
      _id: new ObjectId(),
      fundId,
      holderKind: "character",
      characterId,
      units: 7,
      avgNavAnchor: 4.25,
      legacyUnits: 3,
      createdAt: new Date(1),
      updatedAt: new Date(2),
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(getAuthUserWithCharacter).mockResolvedValue({
    userId: new ObjectId().toString(),
    username: "synthetic",
    character: { _id: characterId, name: "Synthetic investor", countryId: "US", cashOnHand: 100 },
  } as never);
  const run = (operationId = crypto.randomUUID()) =>
    POST(
      new Request("http://localhost/api/investment-funds/test/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ units: 10, operationId }),
      }),
      { params: Promise.resolve({ slug: "test" }) }
    );
  return { ...f, characterId, fundId, run };
}
describe("subscription transaction and replay", () => {
  it.each([
    { collection: "characters", op: "findOneAndUpdate" },
    { collection: "indexFundPositions", op: "findOneAndUpdate" },
    { collection: "indexFundTransactions", op: "insertOne" },
  ] as const)(
    "rolls back a landed $collection write and permits the same request retry",
    async ({ collection, op }) => {
      const f = setup(),
        operation = crypto.randomUUID();
      const before = await f.db.collection("indexFundPositions").findOne({});
      const fault = withInjectedCrash(f.memory, { collection, op, onCall: 1, afterWrite: true });
      vi.mocked(getDb).mockResolvedValue(fault.db);
      expect((await f.run(operation)).status).toBe(409);
      expect(fault.crashed).toBe(true);
      expect(
        (await f.db.collection("characters").findOne({ _id: f.characterId }))?.cashOnHand
      ).toBe(100);
      expect(await f.db.collection("indexFundPositions").findOne({})).toEqual(before);
      expect(await f.db.collection("indexFunds").findOne({})).toMatchObject({
        unitSupply: 7,
        cashAnchor: 7,
      });
      vi.mocked(getDb).mockResolvedValue(f.db);
      expect((await f.run(operation)).status).toBe(200);
      expect((await f.run(operation)).status).toBe(200);
      expect(
        (await f.db.collection("characters").findOne({ _id: f.characterId }))?.cashOnHand
      ).toBe(90);
      expect(await f.db.collection("indexFunds").findOne({})).toMatchObject({
        unitSupply: 17,
        cashAnchor: 17,
      });
    }
  );
  it("overlapping identical requests mint and charge once, and turn processing refuses a fresh order", async () => {
    const f = setup(),
      operation = crypto.randomUUID();
    const replies = await Promise.all([f.run(operation), f.run(operation)]);
    expect(replies.some((r) => r.status === 200)).toBe(true);
    expect((await f.db.collection("characters").findOne({ _id: f.characterId }))?.cashOnHand).toBe(
      90
    );
    expect((await f.db.collection("indexFundPositions").findOne({}))?.units).toBe(17);
    await f.db
      .collection<{ _id: string; isProcessing: boolean }>("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    expect((await f.run()).ok).toBe(false);
    expect((await f.db.collection("characters").findOne({ _id: f.characterId }))?.cashOnHand).toBe(
      90
    );
  });
});
