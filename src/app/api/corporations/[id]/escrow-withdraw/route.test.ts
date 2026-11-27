import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { POST } from "./route";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { resolveCorporation } from "@/lib/api/corporations/resolveQuery";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  resolveCorporation: vi.fn(),
  requireCeo: () => null,
}));
vi.mock("@/lib/gameState", () => ({
  getGameState: (db: import("mongodb").Db) =>
    db.collection("gameState").findOne({ _id: "current" } as never),
}));
beforeEach(() => vi.clearAllMocks());
it("reports and records the returned closing escrow after an interleaved credit", async () => {
  const f = createTransactionalMemoryDb();
  const corpId = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
  f.memory.seed("corporations", [
    {
      _id: corpId,
      name: "Synthetic issuer",
      liquidCurrencyCode: "CAD",
      liquidCapital: 0,
      shareEscrowBalance: 5000000,
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: new ObjectId().toHexString() },
  } as never);
  vi.mocked(resolveCorporation).mockImplementation(async (db) => {
    const corporation = await db.collection("corporations").findOne({ _id: corpId });
    await db
      .collection("corporations")
      .updateOne({ _id: corpId }, { $inc: { shareEscrowBalance: 10000000 } });
    return { ok: true, corporation } as never;
  });
  const response = await POST(
    new Request("http://localhost/api/corporations/1/escrow-withdraw", {
      method: "POST",
      body: JSON.stringify({ amount: 1000000 }),
    }),
    { params: Promise.resolve({ id: "1" }) }
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ escrowRemaining: 14000000 });
  expect(f.memory.collection("corporations").docs[0]).toMatchObject({
    shareEscrowBalance: 14000000,
    liquidCapital: 1000000,
  });
  expect(f.memory.collection("financialTxLog").docs[0].meta).toMatchObject({
    escrowBalanceAfter: 14000000,
  });
});
