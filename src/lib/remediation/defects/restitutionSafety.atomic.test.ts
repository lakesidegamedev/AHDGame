import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { defect as greenbaum } from "./AHD-1694-greenbaum-restoration";
import { defect as vf, HUNT_OIL_ID, HUNT_RESIDUAL_USD } from "./AHD-1267-vf-bank-restitution";
import { defect as injected, ROWS } from "./AHD-1694-injected-bank-restoration";
import { defect as freight } from "./AHD-1448-freight-overbilling-restitution";
import { FREIGHT_OVERBILLING_BY_CORPORATION } from "./AHD-1448-freight-overbilling-restitution.data";
import type { HealContext } from "../types";
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@/lib/banking/charter", () => ({
  checkCharterEligibility: async () => ({ eligible: false, reasons: ["Synthetic refusal"] }),
  issueCharter: async () => ({ ok: false, reasons: ["Synthetic refusal"] }),
}));
const ctx: HealContext = {
  env: "sandbox",
  dryRun: false,
  runId: "synthetic-restitution",
  now: new Date(0),
};
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 10, preset: "2027-default", worldEpochId: "synthetic-refund" },
  ]);
  f.memory.seed("exchangeRates", [
    { _id: "US", currencyCode: "USD", rate: 2 },
    { _id: "CA", currencyCode: "CAD", rate: 2.8 },
    { _id: "FR", currencyCode: "EUR", rate: 2.5 },
  ]);
  return f;
}
describe("historical refund completion and native currency", () => {
  it.each(["corporations", "depositInsuranceFunds", "financialTxLog"])(
    "does not certify an unpaid Greenbaum refund after landed %s",
    async (collection) => {
      const f = fixture(),
        id = new ObjectId("6ac3d322a81b3ad796ca1068");
      f.memory.seed("corporations", [
        {
          _id: id,
          name: "Synthetic recipient",
          countryId: "CA",
          liquidCurrencyCode: "CAD",
          liquidCapital: 10,
        },
      ]);
      f.memory.seed("depositInsuranceFunds", [{ _id: "USD", balance: 4005000000 }]);
      const plan = await greenbaum.plan(f.db, ctx);
      const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
      await expect(greenbaum.apply(fault.db, plan, ctx)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await f.db.collection("corporations").findOne({}))!.liquidCapital).toBe(10);
      expect((await f.db.collection("depositInsuranceFunds").findOne({}))!.balance).toBe(
        4005000000
      );
      await greenbaum.apply(f.db, plan, ctx);
      await greenbaum.apply(f.db, plan, ctx);
      expect((await f.db.collection("corporations").findOne({}))!.liquidCapital).toBe(4207000010);
      expect((await f.db.collection("depositInsuranceFunds").findOne({}))!.balance).toBe(
        1000000000
      );
      expect((await f.db.collection("financialTxLog").findOne({}))!.currencyCode).toBe("CAD");
    }
  );
  it("converts the historical USD residual and rolls back a missing receipt", async () => {
    const f = fixture();
    f.memory.seed("corporations", [
      {
        _id: new ObjectId(HUNT_OIL_ID),
        name: "Synthetic recipient",
        countryId: "CA",
        liquidCurrencyCode: "CAD",
        liquidCapital: 10,
      },
    ]);
    const plan = await vf.plan(f.db, ctx);
    const fault = withInjectedCrash(f.memory, {
      collection: "financialTxLog",
      onCall: 1,
      afterWrite: true,
    });
    await expect(vf.apply(fault.db, plan, ctx)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect((await f.db.collection("corporations").findOne({}))!.liquidCapital).toBe(10);
    await Promise.all([vf.apply(f.db, plan, ctx), vf.apply(f.db, plan, ctx)]);
    expect((await f.db.collection("corporations").findOne({}))!.liquidCapital).toBeCloseTo(
      10 + HUNT_RESIDUAL_USD * 1.4,
      2
    );
    expect((await f.db.collection("financialTxLog").findOne({}))!.anchorAmount).toBe(
      HUNT_RESIDUAL_USD / 2
    );
  });
  it("values an injection-interest refund in the current corporate currency", async () => {
    const f = fixture(),
      row = ROWS[0];
    f.memory.seed("corporations", [
      {
        _id: new ObjectId(row.corporationId),
        countryId: "CA",
        liquidCurrencyCode: "CAD",
        liquidCapital: 10,
      },
    ]);
    const plan = await injected.plan(f.db, ctx);
    await Promise.all([injected.apply(f.db, plan, ctx), injected.apply(f.db, plan, ctx)]);
    expect((await f.db.collection("corporations").findOne({}))!.liquidCapital).toBeCloseTo(
      10 + Math.round(row.refund * 1.4 * 100) / 100,
      2
    );
    expect((await f.db.collection("financialTxLog").findOne({}))!.currencyCode).toBe("CAD");
  });
  it("refreshes a freight credit's denomination before writing the frozen anchor claim", async () => {
    const f = fixture(),
      row = FREIGHT_OVERBILLING_BY_CORPORATION[0];
    const id = new ObjectId(row.corporationId);
    f.memory.seed("corporations", [
      { _id: id, countryId: "CA", liquidCurrencyCode: "CAD", liquidCapital: 10 },
    ]);
    const plan = await freight.plan(f.db, ctx);
    await f.db
      .collection("corporations")
      .updateOne({ _id: id }, { $set: { liquidCurrencyCode: "EUR" } });
    await freight.apply(f.db, plan, ctx);
    expect((await f.db.collection("corporations").findOne({}))!.liquidCapital).toBeCloseTo(
      10 + row.overchargeAnchor * 2.5,
      2
    );
    expect((await f.db.collection("financialTxLog").findOne({}))!.currencyCode).toBe("EUR");
  });
});
