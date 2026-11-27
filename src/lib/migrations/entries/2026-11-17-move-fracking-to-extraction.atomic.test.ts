import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { migration } from "./2026-11-17-move-fracking-to-extraction";
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
const company = new ObjectId(),
  sector = new ObjectId();
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      currentYear: 2027,
      worldEpochId: "synthetic",
      forexEnabled: true,
    },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "US", currencyCode: "USD", rate: 1 },
    { _id: "CA", currencyCode: "CAD", rate: 2 },
  ]);
  f.memory.seed("corporations", [
    {
      _id: company,
      name: "Synthetic company",
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      liquidCapital: 1000,
    },
  ]);
  f.memory.seed("corporateSectors", [
    {
      _id: sector,
      corporationId: company,
      sectorType: "energy",
      strategyId: "fracking",
      capitalStock: 100,
      capacityBookAnchor: 500,
      buildQueue: [],
    },
  ]);
  f.memory.seed("financialTxLog", [
    {
      _id: new ObjectId(),
      type: "corp_sector_retool",
      amount: -100,
      currencyCode: "USD",
      turn: 90,
      meta: { sectorId: sector.toHexString(), action: "retool", toStrategyId: "fracking" },
    },
    {
      _id: new ObjectId(),
      type: "corp_sector_retool",
      amount: -50,
      currencyCode: "CAD",
      turn: 95,
      meta: { sectorId: sector.toHexString(), action: "retool", toStrategyId: "fracking" },
    },
  ]);
  return f;
}
describe("retired method refund settlement", () => {
  it.each(["financialTxLog", "corporations", "corporateSectors"])(
    "a landed %s failure leaves the fee recoverable",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(migration.execute(fault.db, { dryRun: false })).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("corporations").findOne({}))?.liquidCapital).toBe(1000);
      expect((await db.collection("corporateSectors").findOne({}))?.strategyId).toBe("fracking");
      expect(
        await db.collection("financialTxLog").countDocuments({ "meta.action": "retire_refund" })
      ).toBe(0);
      await migration.execute(db, { dryRun: false });
      await migration.execute(db, { dryRun: false });
      expect((await db.collection("corporations").findOne({}))?.liquidCapital).toBe(1250);
      expect((await db.collection("corporateSectors").findOne({}))?.capacityBookAnchor).toBe(500);
      expect(
        await db.collection("financialTxLog").countDocuments({ "meta.action": "retire_refund" })
      ).toBe(1);
      expect(
        await db.collection("financialTxLog").findOne({ "meta.action": "retire_refund" })
      ).toMatchObject({ amount: 250, currencyCode: "CAD" });
    }
  );
  it("dry run does not refund or change the method; missing conversion quotes refuse guesses", async () => {
    const { db } = fixture();
    await migration.execute(db, { dryRun: true });
    expect((await db.collection("corporations").findOne({}))?.liquidCapital).toBe(1000);
    await db.collection("exchangeRates").deleteMany({});
    await expect(migration.execute(db, { dryRun: false })).rejects.toThrow("currency quotes");
    expect((await db.collection("corporateSectors").findOne({}))?.strategyId).toBe("fracking");
  });
});
