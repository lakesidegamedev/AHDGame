import { beforeEach, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { PATCH } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));
let fixture: ReturnType<typeof createTransactionalMemoryDb>;
beforeEach(async () => {
  fixture = createTransactionalMemoryDb();
  fixture.memory.seed("gameState", [{ _id: "current", currentTurn: 10, isProcessing: false }]);
  fixture.memory.seed("commodityPrices", [{ _id: "food", commodity: "food", turn: 10, price: 5 }]);
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(fixture.db);
});
function run() {
  return PATCH(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: 7 }),
    }),
    { params: Promise.resolve({ type: "food" }) }
  );
}
it("targets the next pricing turn and preserves the completed quote", async () => {
  expect((await run()).status).toBe(200);
  expect(fixture.memory.collection("commodityPrices").docs[0]).toMatchObject({
    price: 5,
    nudgePrice: 7,
    nudgeTurn: 11,
  });
});
it("rolls back an unknown write outcome and permits the same retry", async () => {
  const fault = withInjectedCrash(fixture.memory, {
    collection: "commodityPrices",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(fault.db);
  expect((await run()).status).toBe(500);
  expect(fault.crashed).toBe(true);
  expect(fixture.memory.collection("commodityPrices").docs[0].nudgeTurn).toBeUndefined();
  expect((await run()).status).toBe(200);
});
it("refuses a nudge while the pricing turn is processing", async () => {
  fixture.memory.collection("gameState").docs[0].isProcessing = true;
  expect((await run()).status).toBe(409);
  expect(fixture.memory.collection("commodityPrices").docs[0].nudgeTurn).toBeUndefined();
});
