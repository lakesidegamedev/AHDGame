import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { nppBuyBond } from "./nppBonds";
import { nppBuyShares } from "./nppShares";
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./shareCashLedger", () => ({ witnessNppShareCash: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/equities/marketPool", () => ({
  equityPoolCurrency: () => "CAD",
  readEquityPool: async () => ({ _id: "CAD", cashLocal: 0 }),
  loadEquityQuote: async () => ({ askPriceLocal: 20 }),
}));
vi.mock("@/lib/corporations/shareEscrowSettlement", () => ({
  applyFloatBuyCredit: async (db: Db, _corp: unknown, amount: number) => {
    await db
      .collection("equityMarketPools")
      .updateOne({ _id: "CAD" } as never, { $inc: { cashLocal: amount } });
  },
}));
vi.mock("@/lib/bonds/marketPool", async (original) => ({
  ...(await original<typeof import("@/lib/bonds/marketPool")>()),
  loadBondQuote: async () => ({ askPerUnit: 1000 }),
}));
function world() {
  const f = createTransactionalMemoryDb(),
    actor = { _id: new ObjectId(), countryId: "CA" as const },
    id = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10, resetWorldId: "private-test" }]);
  f.memory.seed("npps", [{ ...actor, nppInvestmentCashAnchor: 10000 }]);
  f.memory.seed("bondMarketPools", [{ _id: "CAD", cashLocal: 0 }]);
  f.memory.seed("equityMarketPools", [{ _id: "CAD", cashLocal: 0 }]);
  f.memory.seed("bonds", [
    {
      _id: id,
      currencyCode: "CAD",
      marketPrice: 1,
      publicFloat: 100,
      maturityTurn: 100,
      holders: [],
    },
  ]);
  f.memory.seed("corporations", [
    {
      _id: id,
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      sharePrice: 20,
      totalShares: 1000,
      publicFloat: 100,
      shareholders: [],
    },
  ]);
  return { ...f, actor, id };
}
describe("investment transaction recovery", () => {
  for (const kind of ["stock", "bond"] as const) {
    it(`${kind}: rolls back after the wallet debit and commits overlapping retries once in the original currency`, async () => {
      const f = world();
      const run = (db = f.db, id = f.id) =>
        kind === "stock"
          ? nppBuyShares(db, f.actor, id, 10, 2, undefined, undefined, undefined, 10)
          : nppBuyBond(db, f.actor, id, 2, 10, 2);
      const crash = withInjectedCrash(f.memory, {
        collection: "npps",
        op: "findOneAndUpdate",
        onCall: 1,
        afterWrite: true,
      });
      await expect(run(crash.db)).rejects.toThrow();
      expect(
        (await f.db.collection("npps").findOne({ _id: f.actor._id }))?.nppInvestmentCashAnchor
      ).toBe(10000);
      const [a, b] = await Promise.all([run(), run()]);
      expect(a).toEqual(b);
      expect(a.ok).toBe(true);
      const expected = kind === "stock" ? 100 : 1000;
      expect(
        (await f.db.collection("npps").findOne({ _id: f.actor._id }))?.nppInvestmentCashAnchor
      ).toBe(10000 - expected);
      expect(await run(f.db, new ObjectId())).toEqual(a);
      const pool = kind === "stock" ? "equityMarketPools" : "bondMarketPools";
      expect((await f.db.collection(pool).findOne({ _id: "CAD" } as never))?.cashLocal).toBe(
        expected * 2
      );
      const asset = await f.db
        .collection(kind === "stock" ? "corporations" : "bonds")
        .findOne({ _id: f.id });
      expect(asset?.publicFloat).toBe(kind === "stock" ? 90 : 98);
      expect(await f.db.collection("bankMoneyMoves").countDocuments({})).toBe(1);
    });
  }
});
