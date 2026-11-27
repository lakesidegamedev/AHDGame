import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import {
  loadFxRatesByCurrency,
  resetCorpFxRateCacheForTests,
} from "@/lib/currency/corporationCapital";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
const request = () =>
  new Request("http://localhost/api/admin/forex/IE/nudge", {
    method: "POST",
    body: JSON.stringify({ rate: 2 }),
  });
const params = { params: Promise.resolve({ currencyId: "IE" }) };
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5, worldEpochId: "world" }]);
  f.memory.seed("exchangeRates", [
    { _id: "DE", currencyCode: "EUR", rate: 1 },
    { _id: "IE", currencyCode: "EUR", rate: 1 },
    { _id: "US", currencyCode: "USD", rate: 1.25 },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  return f;
}
describe("shared currency admin nudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCorpFxRateCacheForTests();
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true, admin: { username: "admin" } } as never);
  });
  it("updates authority and followers together and invalidates the batch quote", async () => {
    const f = fixture();
    expect((await loadFxRatesByCurrency(f.db)).get("EUR")).toBe(1);
    expect((await POST(request(), params)).status).toBe(200);
    expect((await loadFxRatesByCurrency(f.db)).get("EUR")).toBe(2);
    expect(f.memory.collection("exchangeRates").docs.map((row) => row.rate)).toEqual([2, 2, 1.25]);
  });
  it.each([false, true])(
    "rolls back an interrupted shared-rate publication, afterWrite=%s",
    async (afterWrite) => {
      const f = fixture();
      const fault = withInjectedCrash(f.memory, {
        collection: "exchangeRates",
        op: "updateMany",
        onCall: 1,
        afterWrite,
      });
      Object.assign(fault.db, { client: f.db.client });
      vi.mocked(getDb).mockResolvedValue(fault.db);
      expect((await POST(request(), params)).status).toBe(500);
      expect(f.memory.collection("exchangeRates").docs.map((row) => row.rate)).toEqual([
        1, 1, 1.25,
      ]);
      fault.disarm();
      expect((await POST(request(), params)).status).toBe(200);
    }
  );
  it("refuses a quote change while a turn owns the economy", async () => {
    const f = fixture();
    await f.memory
      .collection("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    expect((await POST(request(), params)).status).toBe(409);
    expect(f.memory.collection("exchangeRates").docs.map((row) => row.rate)).toEqual([1, 1, 1.25]);
  });
});
