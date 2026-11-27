import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { chargeDisasterFiscalLoss, settlePendingDisasterFiscalLosses } from "./autoDisasterSpawn";
function world(cash = 40) {
  const f = createTransactionalMemoryDb(),
    crisis = {
      _id: new ObjectId(),
      countryIds: ["CA"],
      autoDisasterFiscalCost: 100,
      startTurn: 1,
    } as unknown as Crisis;
  f.memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 2 }]);
  f.memory.seed("crises", [crisis as unknown as Record<string, unknown>]);
  f.memory.seed("federalBudget", [
    {
      _id: "CA",
      countryId: "CA",
      currencyCode: "CAD",
      treasuryBalance: 500,
      treasuryCashLocal: cash,
    },
  ]);
  return { ...f, crisis };
}
describe("funded disaster loss accrual", () => {
  it("rolls back an interrupted cash payment and retains unfunded loss without blocking turns", async () => {
    const f = world(),
      fault = withInjectedCrash(f.memory, {
        collection: "federalBudget",
        op: "updateOne",
        onCall: 1,
        afterWrite: true,
        matches: (args) =>
          (args[1] as { $inc?: Record<string, number> }).$inc?.treasuryCashLocal === -40,
      });
    await expect(chargeDisasterFiscalLoss(fault.db, f.crisis)).rejects.toThrow();
    expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
      treasuryBalance: 500,
      treasuryCashLocal: 40,
    });
    await Promise.all([
      chargeDisasterFiscalLoss(f.db, f.crisis),
      chargeDisasterFiscalLoss(f.db, f.crisis),
    ]);
    expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
      treasuryBalance: 400,
      treasuryCashLocal: 0,
    });
    expect(f.memory.collection("crises").docs[0]).toMatchObject({
      autoDisasterFiscalPaidLocal: 40,
      autoDisasterFiscalUnfundedCost: 60,
      autoDisasterFiscalCurrency: "CAD",
    });
    await settlePendingDisasterFiscalLosses(f.db);
    expect(f.memory.collection("federalBudget").docs[0].treasuryCashLocal).toBe(0);
    await f.db
      .collection("federalBudget")
      .updateOne({ _id: "CA" as never }, { $inc: { treasuryCashLocal: 60 } });
    await Promise.all([
      settlePendingDisasterFiscalLosses(f.db),
      settlePendingDisasterFiscalLosses(f.db),
    ]);
    expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
      treasuryBalance: 400,
      treasuryCashLocal: 0,
    });
    expect(f.memory.collection("crises").docs[0]).toMatchObject({
      autoDisasterFiscalPaidLocal: 100,
      autoDisasterFiscalUnfundedCost: 0,
    });
  });
  it("keeps the original obligation denomination after treasury currency changes", async () => {
    const f = world(0);
    await chargeDisasterFiscalLoss(f.db, f.crisis);
    f.memory.seed("exchangeRates", [
      { currencyCode: "CAD", rate: 2.8 },
      { currencyCode: "USD", rate: 2 },
    ]);
    await f.db.collection("federalBudget").updateOne(
      { _id: "CA" as never },
      {
        $set: {
          currencyCode: "USD",
          treasuryBalance: (400 / 2.8) * 2,
          treasuryCashLocal: (100 / 2.8) * 2,
        },
      }
    );
    await settlePendingDisasterFiscalLosses(f.db);
    expect(f.memory.collection("federalBudget").docs[0].treasuryCashLocal).toBeCloseTo(0);
    expect(f.memory.collection("crises").docs[0].autoDisasterFiscalPaidLocal).toBeCloseTo(100);
    expect(f.memory.collection("crises").docs[0].autoDisasterFiscalUnfundedCost).toBeCloseTo(0);
  });
});
