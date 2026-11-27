import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { absorbOwnedSectorIntoNatCorp } from "./seedToNatCorp";
import { resolveNationalCorporationForSector } from "./nationalCorporation";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("./nationalCorporation", () => ({ resolveNationalCorporationForSector: vi.fn() }));
function world(funded = false) {
  const f = createTransactionalMemoryDb(),
    donor = new ObjectId(),
    receiver = new ObjectId(),
    site = new ObjectId(),
    existing = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  const claims = {
    worldEpoch: "w",
    turn: 5,
    claims: [
      {
        id: "claim",
        debtorAccountId: donor.toHexString(),
        creditorAccountId: "workers",
        producerId: site.toHexString(),
        kind: "wages",
        amount: 30,
      },
    ],
  };
  f.memory.seed("corporations", [
    {
      _id: donor,
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 100,
      producerPayables: claims,
    },
    { _id: receiver, countryId: "CA", liquidCurrencyCode: "CAD", liquidCapital: 200 },
  ]);
  const inventory = { worldEpoch: "w", turn: 5, inputStock: [], outputStock: [] };
  const source = {
    _id: site,
    corporationId: donor,
    countryId: "CA",
    stateId: "ON",
    sectorType: "agriculture" as const,
    strategyId: "traditional",
    revenue: 125,
    workers: 10,
    currentGrowthCost: 5,
    capitalStock: 10,
    capacityBookAnchor: 1000,
    buildQueue: [{ onlineTurn: 10, quantity: 2, costPaidAnchor: 100 }],
    inventoryUnits: { grain: 5 },
    inventoryValueAnchor: 50,
    ...(funded ? { producerInventory: inventory } : {}),
  };
  f.memory.seed("corporateSectors", [
    source,
    {
      _id: existing,
      corporationId: receiver,
      countryId: "CA",
      stateId: "ON",
      sectorType: "agriculture",
      revenue: 250,
      capitalStock: 20,
      capacityBookAnchor: 2000,
      inventoryUnits: { grain: 10 },
      inventoryValueAnchor: 100,
    },
  ]);
  vi.mocked(resolveNationalCorporationForSector).mockResolvedValue({
    _id: receiver,
    countryId: "CA",
    liquidCurrencyCode: "CAD",
  } as never);
  return { ...f, source, donor, receiver };
}
describe("captured market asset recovery", () => {
  it("rolls back a landed donor deletion and merges capacity, stock, construction and debt once", async () => {
    const f = world();
    const fault = withInjectedCrash(f.memory, {
      collection: "corporateSectors",
      op: "deleteOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(absorbOwnedSectorIntoNatCorp(fault.db, f.source as never)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("corporateSectors").docs).toHaveLength(2);
    const results = await Promise.all([
      absorbOwnedSectorIntoNatCorp(f.db, f.source as never),
      absorbOwnedSectorIntoNatCorp(f.db, f.source as never),
    ]);
    expect(results.sort((a, b) => a - b)).toEqual([0, 125]);
    expect(f.memory.collection("corporateSectors").docs).toHaveLength(1);
    expect(f.memory.collection("corporateSectors").docs[0]).toMatchObject({
      revenue: 375,
      capitalStock: 30,
      capacityBookAnchor: 3000,
      inventoryUnits: { grain: 15 },
      inventoryValueAnchor: 150,
      buildQueue: f.source.buildQueue,
    });
    expect(f.memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual([
      100, 200,
    ]);
    expect(f.memory.collection("corporations").docs[0]).toMatchObject({
      producerPayables: { claims: [] },
    });
    expect(f.memory.collection("corporations").docs[1]).toMatchObject({
      producerPayables: { claims: [{ amount: 30 }] },
    });
  });
  it("keeps a funded physical site distinct and transfers its original inventory and bills", async () => {
    const f = world(true);
    const before = structuredClone(f.source.producerInventory);
    await Promise.all([
      absorbOwnedSectorIntoNatCorp(f.db, f.source as never),
      absorbOwnedSectorIntoNatCorp(f.db, f.source as never),
    ]);
    expect(f.memory.collection("corporateSectors").docs).toHaveLength(2);
    expect(
      f.memory
        .collection("corporateSectors")
        .docs.find((row) => String(row._id) === f.source._id.toHexString())
    ).toMatchObject({
      corporationId: f.receiver,
      producerInventory: before,
      revenue: 125,
      capitalStock: 10,
      capacityBookAnchor: 1000,
      buildQueue: f.source.buildQueue,
    });
    expect(f.memory.collection("corporations").docs.map((row) => row.liquidCapital)).toEqual([
      100, 200,
    ]);
    expect(f.memory.collection("corporations").docs[1]).toMatchObject({
      producerPayables: { claims: [{ amount: 30, producerId: f.source._id.toHexString() }] },
    });
  });
  it("refuses a financed donor that cannot fold without erasing its collateral", async () => {
    const f = world();
    await f.db.collection("corporateSectors").updateOne(
      { _id: f.source._id },
      {
        $set: {
          constructionFinancing: { status: "active", escrowLocal: 50, claimId: "secured" },
        },
      }
    );
    await expect(absorbOwnedSectorIntoNatCorp(f.db, f.source as never)).rejects.toThrow(
      /construction loan/
    );
    expect(f.memory.collection("corporateSectors").docs).toHaveLength(2);
    expect(f.memory.collection("corporateSectors").docs[0]).toMatchObject({
      corporationId: f.donor,
      constructionFinancing: { escrowLocal: 50 },
      buildQueue: f.source.buildQueue,
    });
  });
});
