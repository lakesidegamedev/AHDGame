import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyEraCurrencyTopology } from "./applyEraCurrencyTopology";
import { getInitialRates } from "@/lib/constants/currencies";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
it.each([
  "federalBudget",
  "stateBudgets",
  "states",
  "politicalParties",
  "statePartyOrg",
  "npps",
  "bonds",
])("converts every dependent money leg together after interrupted %s", async (collection) => {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 1, preset: "2027-default" }]);
  memory.seed("federalBudget", [
    {
      _id: "FR",
      countryId: "FR",
      currencyCode: "FRF",
      treasuryBalance: 420,
      treasuryCashLocal: 420,
      revenue: { total: 420 },
      taxBases: {},
      spending: { total: 210, byCategory: {} },
      debt: { principal: 420 },
      surplus: 210,
      gdp: 4200,
      baselineSpendingByCategory: {},
      baselineStateGrants: 0,
    },
  ]);
  memory.seed("stateBudgets", [
    {
      _id: "FR-PAR",
      countryId: "FR",
      balance: 420,
      revenue: { total: 420 },
      taxBases: {},
      spending: { total: 210, byCategory: {} },
      surplus: 210,
      stateGdp: 4200,
    },
  ]);
  memory.seed("states", [{ _id: "FR-PAR", countryId: "FR", gdp: 4200 }]);
  memory.seed("politicalParties", [{ _id: new ObjectId(), countryId: "FR", treasury: 420 }]);
  memory.seed("statePartyOrg", [{ _id: new ObjectId(), countryId: "FR", treasury: 420 }]);
  memory.seed("npps", [
    { _id: new ObjectId(), countryId: "FR", currencyBalances: { personal: { FRF: 420 } } },
  ]);
  memory.seed("bonds", [
    {
      _id: new ObjectId(),
      countryId: "FR",
      currencyCode: "FRF",
      faceValue: 420,
      totalIssued: 420,
      holders: [],
    },
  ]);
  const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
  Object.assign(fault.db, { client: db.client });
  await expect(applyEraCurrencyTopology(fault.db, "2027-default", () => {})).rejects.toThrow();
  expect(memory.collection("federalBudget").docs[0]).toMatchObject({
    currencyCode: "FRF",
    treasuryBalance: 420,
  });
  expect(memory.collection("stateBudgets").docs[0].balance).toBe(420);
  expect(memory.collection("politicalParties").docs[0].treasury).toBe(420);
  fault.disarm();
  await Promise.all([
    applyEraCurrencyTopology(db, "2027-default", () => {}),
    applyEraCurrencyTopology(db, "2027-default", () => {}),
  ]);
  const rates = getInitialRates("2027-default"),
    scale = rates.DE! / rates.FR!;
  const expected = 420 * scale;
  expect(memory.collection("federalBudget").docs[0]).toMatchObject({
    currencyCode: "EUR",
    treasuryBalance: expected,
  });
  expect(memory.collection("stateBudgets").docs[0].balance).toBe(expected);
  expect(memory.collection("politicalParties").docs[0].treasury).toBe(expected);
  expect(memory.collection("npps").docs[0].currencyBalances).toEqual({
    personal: { EUR: expected },
  });
  expect(memory.collection("bonds").docs[0].faceValue).toBe(expected);
});
