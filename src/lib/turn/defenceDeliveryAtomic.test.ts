import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyDefenceDeliveries } from "./defenceDeliveryTurn";
import { advanceContract } from "@/lib/db/collections/defenceContracts";
import { depositLots } from "@/lib/db/collections/nationalArsenal";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
function fixture() {
  const f = createTransactionalMemoryDb();
  const corp = new ObjectId(),
    sector = new ObjectId(),
    contract = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5, worldEpochId: "fixture" }]);
  f.memory.seed("federalBudget", [
    {
      _id: "budget",
      countryId: "US",
      currencyCode: "USD",
      gdp: 387000000000,
      spending: { byCategory: { defense: 1000000000 } },
      defenseAppropriation: { balance: 1000000000, encumbered: 10000000, accruedThroughTurn: 5 },
    },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corp,
      name: "Synthetic supplier",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 1000000000,
      unlockedTechNodeIds: [],
    },
  ]);
  f.memory.seed("corporateSectors", [
    {
      _id: sector,
      corporationId: corp,
      countryId: "US",
      sectorType: "defense",
      strategyId: "heavy_armor",
      revenue: 1000000000,
    },
  ]);
  f.memory.seed("defenceContracts", [
    {
      _id: contract,
      countryId: "US",
      corporationId: corp,
      sectorId: sector,
      component: "ground",
      lotsOrdered: 10,
      lotsDelivered: 0,
      pricePerLot: 1000000,
      encumberedAmount: 10000000,
      amountPaid: 0,
      productionCostPaid: 0,
      assignedFactories: 4,
      costBasis: "margin",
      status: "active",
    },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
  return { ...f, corp, sector, contract };
}
it.each(["defenceContracts", "nationalArsenal", "corporateSectors", "financialTxLog"])(
  "rolls back delivery money and physical fulfilment after an interrupted %s write",
  async (collection) => {
    const f = fixture();
    const fault = withInjectedCrash(f.memory, {
      collection,
      onCall: collection === "defenceContracts" ? 3 : 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: f.db.client });
    await expect(applyDefenceDeliveries(fault.db, "US", 1953, 3, 5)).rejects.toThrow();
    expect(
      (
        f.memory.collection("federalBudget").docs[0].defenseAppropriation as {
          balance: number;
          encumbered: number;
        }
      ).balance
    ).toBe(1000000000);
    expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(1000000000);
    expect(f.memory.collection("defenceContracts").docs[0]).toMatchObject({
      lotsDelivered: 0,
      amountPaid: 0,
      status: "active",
    });
    expect(f.memory.collection("nationalArsenal").docs).toHaveLength(0);
    fault.disarm();
    await Promise.all([
      applyDefenceDeliveries(f.db, "US", 1953, 3, 5),
      applyDefenceDeliveries(f.db, "US", 1953, 3, 5),
    ]);
    const c = f.memory.collection("defenceContracts").docs[0];
    expect(c.lotsDelivered).toBeGreaterThan(0);
    expect(c.lotsDelivered).toBeLessThanOrEqual(10);
    expect(
      (f.memory.collection("nationalArsenal").docs[0].stock as Record<string, number>).ground
    ).toBe(c.lotsDelivered);
    expect(
      1000000000 -
        (
          f.memory.collection("federalBudget").docs[0].defenseAppropriation as {
            balance: number;
            encumbered: number;
          }
        ).balance
    ).toBe(c.amountPaid);
    expect(
      Number(f.memory.collection("corporations").docs[0].liquidCapital) -
        1000000000 +
        Number(c.productionCostPaid)
    ).toBe(c.amountPaid);
    expect(f.memory.collection("corporateSectors").docs[0].militaryDivertedTurn).toBe(5);
  }
);
it("never records more lots than ordered when deliveries race", async () => {
  const f = fixture();
  await Promise.all([advanceContract(f.db, f.contract, 6), advanceContract(f.db, f.contract, 6)]);
  expect(f.memory.collection("defenceContracts").docs[0].lotsDelivered).toBeLessThanOrEqual(10);
});
it("preserves weighted arsenal quality under concurrent deposits", async () => {
  const f = fixture();
  await Promise.all([
    depositLots(f.db, "US", "ground", 10, 1),
    depositLots(f.db, "US", "ground", 10, 3),
  ]);
  expect(f.memory.collection("nationalArsenal").docs[0]).toMatchObject({
    stock: { ground: 20 },
    grade: { ground: 2 },
  });
});
