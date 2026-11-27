import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api/requireAuth";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: () => ({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/centralBankChairEvents", () => ({
  notifyCbChairResignedDiscord: vi.fn(async () => {}),
}));
vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn(async () => {}) }));
const context = { params: Promise.resolve({ code: "CA" }) };
const request = () =>
  new Request("http://localhost/api/country/ca/central-bank/resign", { method: "POST" });
function fixture() {
  const f = createTransactionalMemoryDb();
  const chairId = new ObjectId();
  f.memory.seed("characters", [
    { _id: chairId, name: "Chair", currentOffice: { type: "centralBankChair" } },
  ]);
  f.memory.seed("centralBanks", [{ _id: "CA", chairCharacterId: chairId }]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(requireAuth).mockResolvedValue({
    ok: true,
    user: { userId: new ObjectId().toString(), character: { _id: chairId, name: "Chair" } },
  } as never);
  return { ...f, chairId };
}
beforeEach(() => vi.clearAllMocks());
it.each([false, true])(
  "rolls back an interrupted resignation, afterWrite=%s",
  async (afterWrite) => {
    const f = fixture();
    const fault = withInjectedCrash(f.memory, {
      collection: "centralBanks",
      op: "updateOne",
      onCall: 2,
      afterWrite,
    });
    Object.assign(fault.db, { client: f.db.client });
    vi.mocked(getDb).mockResolvedValue(fault.db);
    expect((await POST(request(), context)).status).toBe(500);
    expect(String(f.memory.collection("centralBanks").docs[0].chairCharacterId)).toBe(
      f.chairId.toString()
    );
    expect(f.memory.collection("characters").docs[0].currentOffice).toEqual({
      type: "centralBankChair",
    });
    vi.mocked(getDb).mockResolvedValue(f.db);
    expect((await POST(request(), context)).status).toBe(200);
    expect(f.memory.collection("centralBanks").docs[0].chairCharacterId).toBeNull();
  }
);
it("cannot clear a replacement chair after its authorization snapshot goes stale", async () => {
  const f = fixture();
  const replacement = new ObjectId();
  await f.memory
    .collection("centralBanks")
    .updateOne({ _id: "CA" }, { $set: { chairCharacterId: replacement } });
  expect((await POST(request(), context)).status).toBe(403);
  expect(String(f.memory.collection("centralBanks").docs[0].chairCharacterId)).toBe(
    replacement.toString()
  );
});
it("lets only one concurrent resignation publish the vacancy", async () => {
  fixture();
  const responses = await Promise.all([POST(request(), context), POST(request(), context)]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 403]);
});
