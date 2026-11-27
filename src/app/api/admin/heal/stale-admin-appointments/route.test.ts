import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5, worldEpochId: "world" }]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as never);
  return f;
}
const seat = (countryId: string, characterId = new ObjectId(), time = 1) => ({
  _id: new ObjectId(),
  countryId,
  characterId,
  officeType: "president",
  electedAt: new Date(time),
  updatedAt: new Date(time),
});
beforeEach(() => vi.clearAllMocks());
it("preserves separate countries and ambiguous multi-member mandates", async () => {
  const f = fixture();
  f.memory.seed("electedOfficials", [
    seat("US"),
    seat("CA"),
    { ...seat("US"), officeType: "house", state: "TX", seatsHeld: 20 },
    { ...seat("US"), officeType: "house", state: "TX", seatsHeld: 1 },
  ]);
  const response = await POST();
  expect(response.status).toBe(200);
  expect((await response.json()).removedCount).toBe(0);
  expect(f.memory.collection("electedOfficials").docs).toHaveLength(4);
});
it("does not clear the office of an actor retained in the winning canonical record", async () => {
  const f = fixture(),
    id = new ObjectId();
  f.memory.seed("electedOfficials", [seat("US", id), seat("US", id, 2)]);
  f.memory.seed("characters", [{ _id: id, countryId: "US", currentOffice: { type: "president" } }]);
  expect((await (await POST()).json()).removedCount).toBe(1);
  expect(f.memory.collection("characters").docs[0].currentOffice).toEqual({ type: "president" });
});
it.each([false, true])(
  "rolls back office cleanup when stale-seat deletion is interrupted, afterWrite=%s",
  async (afterWrite) => {
    const f = fixture(),
      old = new ObjectId(),
      current = new ObjectId();
    f.memory.seed("electedOfficials", [seat("US", old), seat("US", current, 2)]);
    f.memory.seed("characters", [
      { _id: old, countryId: "US", currentOffice: { type: "president" } },
    ]);
    const fault = withInjectedCrash(f.memory, {
      collection: "electedOfficials",
      op: "deleteMany",
      onCall: 1,
      afterWrite,
    });
    Object.assign(fault.db, { client: f.db.client });
    vi.mocked(getDb).mockResolvedValue(fault.db);
    expect((await POST()).status).toBe(500);
    expect(f.memory.collection("characters").docs[0].currentOffice).toEqual({ type: "president" });
    expect(f.memory.collection("electedOfficials").docs).toHaveLength(2);
    vi.mocked(getDb).mockResolvedValue(f.db);
    expect((await (await POST()).json()).clearedCharacters).toBe(1);
  }
);
it("does not clear a same-type office held in another country", async () => {
  const f = fixture(),
    old = new ObjectId();
  f.memory.seed("electedOfficials", [seat("US", old), seat("US", new ObjectId(), 2)]);
  f.memory.seed("characters", [
    { _id: old, countryId: "CA", currentOffice: { type: "president" } },
  ]);
  expect((await POST()).status).toBe(200);
  expect(f.memory.collection("characters").docs[0].currentOffice).toEqual({ type: "president" });
});
