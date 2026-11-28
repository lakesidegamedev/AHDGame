import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { ensureDomesticSovereignBondFunds } from "./ensure";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/country/registeredCountries", () => ({
  getRegisteredCountryIds: vi.fn(async () => ["US"]),
}));
it("publishes a seeded fund and reserve ownership atomically under interrupted and overlapping runs", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("federalBudget", [{ _id: "federal" }]);
  memory.seed("bonds", [
    { _id: new ObjectId(), countryId: "US", issuerType: "sovereign", matured: false },
  ]);
  const fault = withInjectedCrash(memory, {
    collection: "indexFundPositions",
    op: "bulkWrite",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(ensureDomesticSovereignBondFunds(fault.db, { enabled: true })).rejects.toThrow();
  expect(memory.collection("indexFunds").docs).toHaveLength(0);
  expect(memory.collection("indexFundPositions").docs).toHaveLength(0);
  fault.disarm();
  await Promise.all([
    ensureDomesticSovereignBondFunds(db, { enabled: true }),
    ensureDomesticSovereignBondFunds(db, { enabled: true }),
  ]);
  expect(memory.collection("indexFunds").docs).toHaveLength(1);
  expect(memory.collection("indexFundPositions").docs).toHaveLength(1);
  const fund = memory.collection("indexFunds").docs[0];
  const position = memory.collection("indexFundPositions").docs[0];
  expect(position.units).toBe(fund.unitSupply);
  expect(fund.cashAnchor).toBe(Number(position.units) * Number(position.avgNavAnchor));
  memory.collection("indexFundPositions").docs.splice(0);
  await ensureDomesticSovereignBondFunds(db, { enabled: true });
  expect(memory.collection("indexFundPositions").docs[0].units).toBe(fund.reserveUnits);
  expect(memory.collection("indexFunds").docs).toHaveLength(1);
});
