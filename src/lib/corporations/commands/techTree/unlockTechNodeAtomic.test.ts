import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { corpNodeId } from "@/lib/constants/techTree";
import { emitTxStrict } from "@/lib/financialTxLog/emit";
import { unlockTechNode } from "./unlockTechNode";
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxStrict: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/corporations/dailyGrossRevenue", () => ({
  corpDailyGrossRevenuePricingLocal: async () => ({
    dailyGrossRevenueLocal: 180_000_000,
    techCashFloorLocal: 0,
    techPlantBasis: 0,
  }),
}));
vi.mock("@/lib/corporations/techTree/legacyTechContext", () => ({
  loadLegacyTechContext: async () => ({}),
}));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb();
  const corp = {
    _id: new ObjectId(),
    type: "energy",
    countryId: "US",
    liquidCurrencyCode: "USD",
    rdScore: 300,
    liquidCapital: 100_000_000,
    unlockedTechNodeIds: [],
    techDecadeLane: {},
  } as unknown as Corporation;
  f.memory.seed("corporations", [{ ...corp }]);
  return { ...f, corp };
}
it("rolls back research, cash, lane and grants if its receipt fails, then retries once", async () => {
  const f = setup(),
    node = corpNodeId("2019", 1);
  vi.mocked(emitTxStrict).mockRejectedValueOnce(new Error("interrupted research receipt"));
  await expect(unlockTechNode(f.db, f.corp, node, 2020, 100)).rejects.toThrow(
    "interrupted research receipt"
  );
  expect(f.memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 100_000_000,
    rdScore: 300,
    unlockedTechNodeIds: [],
    techDecadeLane: {},
  });
  const results = await Promise.all(
    [0, 1].map(() => unlockTechNode(f.db, f.corp, node, 2020, 100))
  );
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(f.memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 91_000_000,
    rdScore: 262,
    unlockedTechNodeIds: [node],
  });
});
it("refuses a stale denomination without consuming research or cash", async () => {
  const f = setup();
  await f.memory
    .collection("corporations")
    .updateOne({ _id: f.corp._id }, { $set: { liquidCurrencyCode: "CAD" } });
  expect((await unlockTechNode(f.db, f.corp, corpNodeId("2019", 1), 2020, 100)).ok).toBe(false);
  expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(100_000_000);
});
