import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { DELETE, POST } from "./handlers";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: async () => ({ ok: true, admin: { username: "test" } }),
}));
const us = new ObjectId(),
  ca = new ObjectId();
let f: ReturnType<typeof createTransactionalMemoryDb>;
beforeEach(() => {
  f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("elections", [
    { _id: us, countryId: "US", cycle: 2 },
    { _id: ca, countryId: "CA", cycle: 2 },
  ]);
  f.memory.seed("electionCandidates", [
    { _id: new ObjectId(), electionId: us },
    { _id: new ObjectId(), electionId: ca },
  ]);
  f.memory.seed("campaigns", [
    { _id: new ObjectId(), electionId: us, funds: 0 },
    { _id: new ObjectId(), electionId: ca, funds: 500 },
  ]);
});
async function remove(db = f.db, country = "US") {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  return DELETE(new Request("http://localhost?cycle=2", { method: "DELETE" }), {
    params: Promise.resolve({ code: country }),
  });
}
it("deletes only the URL country's empty cycle and retains a foreign funded campaign", async () => {
  expect((await remove()).status).toBe(200);
  expect(f.memory.collection("elections").docs).toMatchObject([{ countryId: "CA" }]);
  expect(f.memory.collection("campaigns").docs).toMatchObject([{ electionId: ca, funds: 500 }]);
});
it("refuses to destroy a funded cycle", async () => {
  expect((await remove(f.db, "CA")).status).toBe(409);
  expect(f.memory.collection("elections").docs).toHaveLength(2);
  expect(f.memory.collection("campaigns").docs).toHaveLength(2);
});
it.each(["electionCandidates", "campaigns", "elections"])(
  "a landed %s deletion rolls back the whole cycle operation",
  async (collection) => {
    const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
    expect((await remove(fault.db)).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("elections").docs).toHaveLength(2);
    expect(f.memory.collection("campaigns").docs).toHaveLength(2);
    expect((await remove(fault.db)).status).toBe(200);
  }
);
it("cannot create US template elections through a Canadian URL", async () => {
  expect(
    (
      await POST(new Request("http://localhost", { method: "POST" }), {
        params: Promise.resolve({ code: "CA" }),
      })
    ).status
  ).toBe(400);
  expect(f.memory.collection("elections").docs).toHaveLength(2);
});
