import type { Corporation, IndexFund } from "@/lib/db/types";
import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { executeFundOnlyBuyout } from "./fundOnlyBuyout";
import { sellFundHoldingShares } from "@/lib/indexFunds/fundRedemptionLiquidity";
import { openPrivatizationVote } from "./openPrivatizationVote";
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("../acquisitions/referenceValuation", () => ({
  referenceValuation: vi.fn().mockResolvedValue({ minimumPriceAnchor: 100_000 }),
}));
vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/corporationCapital")>()),
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map([["USD", 1]])),
}));
vi.mock("@/lib/indexFunds/fundRedemptionLiquidity", () => ({ sellFundHoldingShares: vi.fn() }));
function fixture() {
  const { db, memory } = createTransactionalMemoryDb();
  const corpId = new ObjectId(),
    ceoId = new ObjectId(),
    funds = [new ObjectId(), new ObjectId()];
  const corporation = {
    _id: corpId,
    name: "Synthetic",
    ceoId,
    totalShares: 1000,
    publicFloat: 0,
    liquidCapital: 30_000,
    liquidCurrencyCode: "USD",
    isPrivate: false,
    sharePrice: 1,
    shareholders: [
      { characterId: ceoId, shares: 900 },
      ...funds.map((fundId) => ({ fundId, shares: 50 })),
    ],
  };
  memory.seed("corporations", [corporation]);
  memory.seed(
    "indexFunds",
    funds.map((_id) => ({ _id, cashAnchor: 0, holdings: [{ corporationId: corpId, shares: 50 }] }))
  );
  vi.mocked(sellFundHoldingShares).mockImplementation(
    async (activeDb, fund, corporationId, shares) => {
      await activeDb.collection<Corporation>("corporations").updateOne(
        { _id: corporationId },
        {
          $inc: { liquidCapital: -shares, publicFloat: shares },
          $pull: { shareholders: { fundId: fund._id } },
        }
      );
      await activeDb.collection<IndexFund>("indexFunds").updateOne(
        { _id: fund._id },
        {
          $inc: { cashAnchor: shares },
          $pull: { holdings: { corporationId } },
        }
      );
      return { cashRaisedAnchor: shares, sharesSold: shares, salesExecuted: 1 };
    }
  );
  return { db, memory, corpId, ceoId, funds, corporation };
}
describe("fund-only buyout rollback", () => {
  it("restores ordinary sales and earlier top-ups on interruption, then retries without duplicating cash", async () => {
    const f = fixture();
    const collection = f.memory.collection("indexFunds");
    const update = collection.updateOne.bind(collection);
    let interrupt = true;
    vi.spyOn(collection, "updateOne").mockImplementation(async (filter, operation, options) => {
      if (
        interrupt &&
        String(filter._id) === String(f.funds[1]) &&
        Number((operation as { $inc?: { cashAnchor?: number } }).$inc?.cashAnchor) > 50
      ) {
        interrupt = false;
        throw new Error("interrupted top-up");
      }
      return update(filter, operation, options);
    });
    await expect(executeFundOnlyBuyout(f.db, f.corporation as never, 10)).rejects.toThrow(
      "interrupted top-up"
    );
    expect(
      (await f.memory.collection("corporations").findOne({ _id: f.corpId }))?.liquidCapital
    ).toBe(30_000);
    expect(collection.docs.map((doc) => doc.cashAnchor)).toEqual([0, 0]);
    expect(await executeFundOnlyBuyout(f.db, f.corporation as never, 10)).toEqual({ ok: true });
    expect(
      (await f.memory.collection("corporations").findOne({ _id: f.corpId }))?.liquidCapital
    ).toBe(20_000);
    expect(collection.docs.map((doc) => doc.cashAnchor)).toEqual([5000, 5000]);
    expect((await executeFundOnlyBuyout(f.db, f.corporation as never, 10)).ok).toBe(false);
    expect(collection.docs.map((doc) => doc.cashAnchor)).toEqual([5000, 5000]);
  });
  it("aborts partial sales even when nested in the vote-opening transaction", async () => {
    const f = fixture();
    const sell = vi.mocked(sellFundHoldingShares).getMockImplementation()!;
    vi.mocked(sellFundHoldingShares).mockImplementation(async (...args) => {
      await sell(...args);
      return { cashRaisedAnchor: 1, sharesSold: 1, salesExecuted: 1 };
    });
    const result = await openPrivatizationVote({
      db: f.db,
      corporation: f.corporation as never,
      character: { _id: f.ceoId } as never,
      currentTurn: 10,
      forexEnabled: false,
    });
    expect(result.ok).toBe(false);
    expect(
      (await f.memory.collection("corporations").findOne({ _id: f.corpId }))?.liquidCapital
    ).toBe(30_000);
    expect(f.memory.collection("indexFunds").docs.map((doc) => doc.cashAnchor)).toEqual([0, 0]);
  });
});
