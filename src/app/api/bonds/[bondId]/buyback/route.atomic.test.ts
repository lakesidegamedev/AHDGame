import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { emitTx } from "@/lib/financialTxLog/emit";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: async () => null,
}));
vi.mock("@/lib/bonds/marketPoolLedger", () => ({
  currentBondPoolLedgerContext: async () => null,
  witnessBondPoolCash: async () => undefined,
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => vi.clearAllMocks());
it("rolls back issuer debit, retirement and pool payment on interruption, then retires once", async () => {
  const f = createTransactionalMemoryDb(),
    issuer = new ObjectId(),
    user = new ObjectId(),
    ceo = new ObjectId(),
    bond = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("corporations", [
    {
      _id: issuer,
      name: "Synthetic",
      userId: user,
      ceoId: ceo,
      liquidCurrencyCode: "USD",
      countryId: "US",
      liquidCapital: 10_000,
    },
  ]);
  f.memory.seed("bonds", [
    {
      _id: bond,
      corporationId: issuer,
      issuerType: "corporation",
      currencyCode: "USD",
      marketPrice: 1,
      publicFloat: 1,
      totalIssued: 1000,
      holders: [],
      matured: false,
      defaulted: false,
    },
  ]);
  f.memory.seed("bondMarketPools", [{ _id: "USD", cashLocal: 100_000, targetCashLocal: 100_000 }]);
  f.memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: user.toString(), activeCharacterId: ceo.toString() },
  } as never);
  const run = () =>
    POST(
      new Request("http://localhost/api/buyback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ units: 1 }),
      }),
      { params: Promise.resolve({ bondId: bond.toString() }) }
    );
  vi.mocked(emitTx).mockRejectedValueOnce(new Error("interrupted retirement receipt"));
  expect((await run()).status).toBe(500);
  expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(10_000);
  expect(f.memory.collection("bonds").docs[0]).toMatchObject({
    publicFloat: 1,
    totalIssued: 1000,
    matured: false,
  });
  expect(f.memory.collection("bondMarketPools").docs[0].cashLocal).toBe(100_000);
  const results = await Promise.all([run(), run()]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(f.memory.collection("bonds").docs[0]).toMatchObject({
    publicFloat: 0,
    totalIssued: 0,
    matured: true,
  });
  const paid = 10_000 - Number(f.memory.collection("corporations").docs[0].liquidCapital);
  expect(Number(f.memory.collection("bondMarketPools").docs[0].cashLocal) - 100_000).toBeCloseTo(
    paid,
    8
  );
});
