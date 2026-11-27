import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { placeUnsoldBondUnits, settlePlacementProceeds } from "./primaryMarket";
import { placePendingShareIssuances } from "@/lib/equities/primaryMarket";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/bonds/marketPool", async (original) => ({
  ...(await original<typeof import("@/lib/bonds/marketPool")>()),
  loadBondQuote: vi.fn().mockResolvedValue({ askPerUnit: 1000, bidPerUnit: 980 }),
}));
function fixture(kind: "bond" | "equity") {
  const f = createTransactionalMemoryDb();
  const corpId = new ObjectId(),
    bondId = new ObjectId();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 5, worldEpochId: new ObjectId().toHexString() },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "US", currencyCode: "USD", rate: 1 },
    { _id: "CA", currencyCode: "CAD", rate: 2 },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corpId,
      countryId: "CA",
      name: "Synthetic issuer",
      liquidCurrencyCode: "CAD",
      liquidCapital: 0,
      sharePrice: 1,
      totalShares: 1000,
      publicFloat: 1,
      isPrivate: false,
      ...(kind === "equity"
        ? {
            pendingShareIssuance: {
              remainingShares: 1,
              requestedShares: 100,
              source: "ipo",
              issuedUpfront: true,
              createdAtTurn: 1,
              initialPriceLocal: 1,
            },
          }
        : {}),
    },
  ]);
  f.memory.seed(
    "bonds",
    kind === "bond"
      ? [
          {
            _id: bondId,
            corporationId: corpId,
            issuerType: "corporation",
            currencyCode: "USD",
            couponRate: 5,
            maturityTurn: 100,
            requestedUnits: 1,
            unsoldUnits: 1,
            publicFloat: 0,
            totalIssued: 0,
            marketPrice: 1,
            matured: false,
            defaulted: false,
            holders: [],
          },
        ]
      : []
  );
  f.memory.seed(kind === "bond" ? "bondMarketPools" : "equityMarketPools", [
    {
      _id: kind === "bond" ? "USD" : "CAD",
      cashLocal: 100000,
      targetCashLocal: 0,
      m2Local: 1000000,
    },
  ]);
  return { ...f, corpId, bondId };
}
describe("funded primary placement", () => {
  it.each([false, true])(
    "preserves a corporate bond's cash, units and issuer proceeds across interruption, afterWrite=%s",
    async (afterWrite) => {
      const f = fixture("bond");
      const fault = withInjectedCrash(f.memory, {
        collection: "corporations",
        op: "updateOne",
        onCall: 1,
        afterWrite,
      });
      await expect(placeUnsoldBondUnits(fault.db, 5, new Date())).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("bondMarketPools").docs[0].cashLocal).toBe(100000);
      expect(f.memory.collection("bonds").docs[0]).toMatchObject({
        unsoldUnits: 1,
        publicFloat: 0,
        totalIssued: 0,
      });
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(0);
      const result = await placeUnsoldBondUnits(f.db, 5, new Date());
      expect(result.unitsPlaced).toBe(1);
      expect(f.memory.collection("bondMarketPools").docs[0].cashLocal).toBe(99000);
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(2000);
      await settlePlacementProceeds(
        f.db,
        result,
        new Map([
          ["USD", 1],
          ["CAD", 2],
        ]),
        new Date()
      );
      await placeUnsoldBondUnits(f.db, 5, new Date());
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(2000);
    }
  );
  it.each([false, true])(
    "preserves a pending IPO's pool payment and publication, afterWrite=%s",
    async (afterWrite) => {
      const f = fixture("equity");
      const fault = withInjectedCrash(f.memory, {
        collection: "corporations",
        op: "updateOne",
        onCall: 1,
        afterWrite,
      });
      await expect(placePendingShareIssuances(fault.db, 5, new Date())).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("equityMarketPools").docs[0].cashLocal).toBe(100000);
      expect(f.memory.collection("corporations").docs[0]).toMatchObject({
        liquidCapital: 0,
        publicFloat: 1,
        totalShares: 1000,
      });
      const result = await placePendingShareIssuances(f.db, 5, new Date());
      expect(result.sharesPlaced).toBe(1);
      const issuer = f.memory.collection("corporations").docs[0];
      expect(issuer.liquidCapital).toBeGreaterThan(0);
      expect(
        Number(f.memory.collection("equityMarketPools").docs[0].cashLocal) +
          Number(issuer.liquidCapital)
      ).toBeCloseTo(100000, 8);
      const paid = issuer.liquidCapital;
      await placePendingShareIssuances(f.db, 5, new Date());
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(paid);
    }
  );
});
