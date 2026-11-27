import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: async () => ({ ok: true, admin: { username: "test" } }),
}));
const id = new ObjectId();
let f: ReturnType<typeof createTransactionalMemoryDb>;
beforeEach(() => {
  f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10, isProcessing: false }]);
  f.memory.seed("characters", [
    {
      _id: id,
      cashOnHand: 100,
      lineOfCredit: { balances: { USD: 50 }, arrears: { USD: 20 }, drawFrozen: true },
    },
  ]);
});
async function run(db = f.db) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  return POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: id.toString(),
        currency: "USD",
        action: "forgive_arrears",
      }),
    })
  );
}
it.each(["characters", "locLedger"])(
  "a landed %s failure preserves arrears until the receipt can commit",
  async (collection) => {
    const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
    expect((await run(fault.db)).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("characters").docs[0].lineOfCredit).toMatchObject({
      arrears: { USD: 20 },
      drawFrozen: true,
    });
    expect((await run(fault.db)).status).toBe(200);
    expect((await run()).status).toBe(400);
    expect(f.memory.collection("locLedger").docs.map((row) => row.type)).toEqual([
      "admin_forgive",
      "unfreeze",
    ]);
    expect(f.memory.collection("characters").docs[0].cashOnHand).toBe(100);
  }
);
it("overlapping forgiveness requests release the original arrears once", async () => {
  const responses = await Promise.all([run(), run()]);
  expect(responses.map((row) => row.status).sort()).toEqual([200, 400]);
  expect(f.memory.collection("locLedger").docs).toHaveLength(2);
});
