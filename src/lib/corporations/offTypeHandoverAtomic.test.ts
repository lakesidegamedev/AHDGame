import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { runOffTypeHandover } from "./offTypeHandover";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
function fixture() {
  const f = createTransactionalMemoryDb();
  const seller = new ObjectId(),
    buyer = new ObjectId(),
    sector = new ObjectId();
  const key = `1:${sector}`;
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 2 }]);
  f.memory.seed("corporations", [
    {
      _id: seller,
      ceoType: "npp",
      countryId: "US",
      type: "agriculture",
      liquidCurrencyCode: "USD",
      liquidCapital: 100,
      name: "Synthetic seller",
    },
    {
      _id: buyer,
      ceoType: "npp",
      countryId: "US",
      type: "energy",
      liquidCurrencyCode: "USD",
      liquidCapital: 900,
      name: "Synthetic buyer",
    },
  ]);
  f.memory.seed("corporateSectors", [
    {
      _id: sector,
      corporationId: buyer,
      sectorType: "energy",
      stateId: "TX",
      capitalStock: 12,
      inventoryValueAnchor: 7,
      inventoryByCommodity: { energy: 3 },
      constructionQueue: [{ plants: 2 }],
    },
  ]);
  f.memory.seed("offTypeHandovers", [
    {
      _id: key,
      turn: 1,
      sectorId: sector,
      sellerId: seller,
      buyerId: buyer,
      priceAnchor: 100,
      priceLocal: 100,
      currency: "USD",
      state: "moved",
      at: new Date(),
    },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
  return { ...f, seller, buyer, sector, key };
}
const args = { turn: 2, year: 2027, eraUnitScale: 1, stage: 0 };
it("finishes an older moved receipt while new handovers are disabled without touching plant property", async () => {
  const f = fixture();
  const before = structuredClone(f.memory.collection("corporateSectors").docs[0]);
  await Promise.all([runOffTypeHandover(f.db, args), runOffTypeHandover(f.db, args)]);
  expect(f.memory.collection("corporations").docs.map((r) => r.liquidCapital)).toEqual([200, 900]);
  expect(f.memory.collection("offTypeHandovers").docs[0].state).toBe("done");
  expect(f.memory.collection("corporateSectors").docs[0]).toEqual(before);
});
it("rolls back seller cash and terminal receipt if its ledger acknowledgement is lost", async () => {
  const f = fixture();
  const fault = withInjectedCrash(f.memory, {
    collection: "financialTxLog",
    op: "insertMany",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: f.db.client });
  await expect(runOffTypeHandover(fault.db, args)).rejects.toThrow();
  expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(100);
  expect(f.memory.collection("offTypeHandovers").docs[0].state).toBe("moved");
  fault.disarm();
  await runOffTypeHandover(f.db, args);
  expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(200);
});
it("does not re-credit a legacy seller whose receipt marker was overwritten by a later handover", async () => {
  const f = fixture();
  f.memory.collection("corporations").docs[0].offTypeHandoverCreditKey = "3:other";
  const result = await runOffTypeHandover(f.db, args);
  expect(result.moved).toBe(0);
  expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(100);
  expect(f.memory.collection("offTypeHandovers").docs[0].state).toBe("moved");
});
