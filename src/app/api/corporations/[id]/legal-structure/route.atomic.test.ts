import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { LEGAL_STRUCTURES } from "@/lib/constants/legalStructures";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: async () => null,
}));
const owner = new ObjectId(),
  corp = new ObjectId();
let fixture: ReturnType<typeof createTransactionalMemoryDb>;
beforeEach(async () => {
  fixture = createTransactionalMemoryDb();
  fixture.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  fixture.memory.seed("corporations", [
    { _id: corp, userId: owner, countryId: "US", isPrivate: true, cash: 500 },
  ]);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: owner.toString() },
  } as never);
});
async function run(db = fixture.db) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  const structure = LEGAL_STRUCTURES.find(
    (row) => row.countryId === "US" && row.id === "us_c_corp"
  )!;
  return POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legalStructure: structure.id }),
    }),
    { params: Promise.resolve({ id: corp.toString() }) }
  );
}
it("rolls back the legal-form write when its acknowledgement is lost", async () => {
  const fault = withInjectedCrash(fixture.memory, {
    collection: "corporations",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  expect((await run(fault.db)).status).toBe(500);
  expect(fault.crashed).toBe(true);
  expect(fixture.memory.collection("corporations").docs[0].legalStructure).toBeUndefined();
  expect((await run(fault.db)).status).toBe(200);
  expect(fixture.memory.collection("corporations").docs[0].cash).toBe(500);
});
it("refuses a public company and turn processing", async () => {
  fixture.memory.collection("corporations").docs[0].isPrivate = false;
  expect((await run()).status).toBe(403);
  fixture.memory.collection("corporations").docs[0].isPrivate = true;
  fixture.memory.collection("gameState").docs[0].isProcessing = true;
  expect((await run()).status).toBe(409);
});
