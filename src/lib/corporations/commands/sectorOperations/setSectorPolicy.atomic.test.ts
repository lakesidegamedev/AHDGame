import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { setSectorPolicy } from "./setSectorPolicy";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
const owner = new ObjectId(),
  corpId = new ObjectId(),
  sectorId = new ObjectId();
beforeEach(async () => {
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: owner.toString() },
  } as never);
});
function fixture() {
  const state = createTransactionalMemoryDb();
  state.memory.seed("gameState", [{ _id: "current", currentTurn: 1, isProcessing: false }]);
  state.memory.seed("corporations", [{ _id: corpId, userId: owner, countryId: "US" }]);
  state.memory.seed("corporateSectors", [
    { _id: sectorId, corporationId: corpId, productionPolicy: 5 },
  ]);
  return state;
}
async function run() {
  return setSectorPolicy(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productionPolicy: 6 }),
    }),
    { params: Promise.resolve({ id: corpId.toString(), sectorId: sectorId.toString() }) }
  );
}
it("rolls back a landed policy write and permits a clean retry", async () => {
  const { memory } = fixture();
  const fault = withInjectedCrash(memory, {
    collection: "corporateSectors",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(fault.db);
  expect((await run()).status).toBe(500);
  expect(fault.crashed).toBe(true);
  expect(memory.collection("corporateSectors").docs[0].productionPolicy).toBe(5);
  expect((await run()).status).toBe(200);
  expect(memory.collection("corporateSectors").docs[0].productionPolicy).toBe(6);
});
it("refuses writes during processing or after ownership changed", async () => {
  const { db, memory } = fixture();
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  memory.collection("gameState").docs[0].isProcessing = true;
  expect((await run()).status).toBe(409);
  memory.collection("gameState").docs[0].isProcessing = false;
  memory.collection("corporateSectors").docs[0].corporationId = new ObjectId();
  expect((await run()).status).toBe(404);
  expect(memory.collection("corporateSectors").docs[0].productionPolicy).toBe(5);
});
