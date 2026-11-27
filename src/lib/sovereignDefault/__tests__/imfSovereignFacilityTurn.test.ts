import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { getImfCorporation } from "@/lib/imf/resolveImfCorporation";
import { emitTx } from "@/lib/financialTxLog/emit";
import { processSovereignImfFacilityPayments } from "../imfSovereignFacilityTurn";
vi.mock("@/lib/imf/resolveImfCorporation", () => ({ getImfCorporation: vi.fn() }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => vi.clearAllMocks());
function setup(funded = true, cash = 1000) {
  const f = createTransactionalMemoryDb();
  const imf = {
    _id: new ObjectId(),
    name: "Synthetic IMF",
    countryId: "JP",
    liquidCurrencyCode: "JPY",
    liquidCapital: 0,
  };
  f.memory.seed("corporations", [{ ...imf }]);
  f.memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: funded }]);
  f.memory.seed("exchangeRates", [
    { _id: "CAD", currencyCode: "CAD", rate: 2 },
    { _id: "JPY", currencyCode: "JPY", rate: 100 },
  ]);
  f.memory.seed("federalBudget", [
    {
      _id: "CA",
      countryId: "CA",
      currencyCode: "CAD",
      treasuryCashLocal: cash,
      treasuryBalance: 1000,
      imfSovereignBailoutActive: true,
      imfSovereignFacilityPrincipalOutstanding: 1000,
      imfSovereignFacilityAnnualRate: 0,
      imfSovereignFacilityAmortizationTurnsRemaining: 10,
      imfSovereignFacilityIncomeCaptureFraction: 0.2,
      revenue: { total: TURNS_PER_YEAR * 1000 },
    },
  ]);
  vi.mocked(getImfCorporation).mockImplementation(
    async (db) => db.collection("corporations").findOne({ _id: imf._id }) as never
  );
  return { ...f, imf, run: () => processSovereignImfFacilityPayments(f.db, 100) };
}
describe("sovereign IMF cash settlement", () => {
  it.each([true, false])(
    "debits the selected Treasury cash, amortizes once, and conserves cross-currency cash (funded=%s)",
    async (funded) => {
      const f = setup(funded);
      const results = await Promise.all([f.run(), f.run()]);
      expect(results.reduce((n, r) => n + r.paymentsApplied, 0)).toBe(1);
      expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
        treasuryBalance: 900,
        treasuryCashLocal: funded ? 900 : 1000,
        imfSovereignFacilityPrincipalOutstanding: 900,
        imfSovereignFacilityAmortizationTurnsRemaining: 9,
        imfSovereignFacilityLastPaymentTurn: 100,
        imfSovereignFacilityCumulativePaidAnchor: 50,
      });
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(5000);
      await f.run();
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(5000);
    }
  );
  it("caps principal repayment at available funded cash", async () => {
    const f = setup(true, 30);
    await f.run();
    expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
      treasuryCashLocal: 0,
      treasuryBalance: 970,
      imfSovereignFacilityPrincipalOutstanding: 970,
    });
    expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(1500);
  });
  it("capitalizes unpaid interest once when Treasury has no cash", async () => {
    const f = setup(true, 0);
    await f.memory
      .collection("federalBudget")
      .updateOne({ _id: "CA" }, { $set: { imfSovereignFacilityAnnualRate: 12 } });
    await f.run();
    const principal = Number(
      f.memory.collection("federalBudget").docs[0].imfSovereignFacilityPrincipalOutstanding
    );
    expect(principal).toBeCloseTo(1000 + (1000 * 0.12) / TURNS_PER_YEAR, 10);
    await f.run();
    expect(
      f.memory.collection("federalBudget").docs[0].imfSovereignFacilityPrincipalOutstanding
    ).toBe(principal);
    expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(0);
  });
  it("rolls back paid prefixes and its turn stamp when the receipt fails", async () => {
    const f = setup();
    vi.mocked(emitTx).mockRejectedValueOnce(new Error("interrupted sovereign receipt"));
    await expect(f.run()).rejects.toThrow("interrupted sovereign receipt");
    expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
      treasuryCashLocal: 1000,
      treasuryBalance: 1000,
      imfSovereignFacilityPrincipalOutstanding: 1000,
    });
    expect(
      f.memory.collection("federalBudget").docs[0].imfSovereignFacilityLastPaymentTurn
    ).toBeUndefined();
    expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(0);
    expect((await f.run()).paymentsApplied).toBe(1);
  });
  it("does not advance a facility whose IMF recipient is missing", async () => {
    const f = setup();
    vi.mocked(getImfCorporation).mockResolvedValue(null);
    expect((await f.run()).paymentsApplied).toBe(0);
    expect(
      f.memory.collection("federalBudget").docs[0].imfSovereignFacilityPrincipalOutstanding
    ).toBe(1000);
  });
  it("closes a fully repaid facility without another payment on retry", async () => {
    const f = setup();
    await f.memory.collection("federalBudget").updateOne(
      { _id: "CA" },
      {
        $set: {
          imfSovereignFacilityPrincipalOutstanding: 1,
          imfSovereignFacilityAmortizationTurnsRemaining: 1,
        },
      }
    );
    expect((await f.run()).paymentsApplied).toBe(1);
    expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
      imfSovereignBailoutActive: false,
      imfSovereignFacilityPrincipalOutstanding: 0,
    });
    expect((await f.run()).paymentsApplied).toBe(0);
  });
});
