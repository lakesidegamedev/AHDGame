import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { mergeNationalFisc } from "./mergeNationalFisc";
import { mergeRegion } from "./mergeRegion";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
vi.mock("@/lib/turn/history/recordCountryEvent", () => ({
  recordCountryEvent: vi.fn().mockResolvedValue(undefined),
}));
describe("fiscal stock conservation", () => {
  it("rolls back a landed successor credit and transfers cash and every appropriation once", async () => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
    f.memory.seed("exchangeRates", [
      { currencyCode: "CAD", rate: 4 },
      { currencyCode: "USD", rate: 8 },
    ]);
    f.memory.seed("federalBudget", [
      {
        _id: "CA",
        countryId: "CA",
        currencyCode: "CAD",
        treasuryBalance: 100,
        treasuryCashLocal: 10,
        debt: { principal: 0 },
        defenseAppropriation: {
          balance: 20,
          encumbered: 5,
          accruedThroughTurn: 10,
          governmentTenderReservations: { one: { state: "held", amount: 5 } },
        },
        intelligenceAppropriation: { balance: 6, accruedThroughTurn: 10 },
        departmentAccounts: {
          health: {
            departmentId: "health",
            portfolioId: "health",
            balance: 30,
            encumbered: 10,
            arrears: 4,
            accruedThroughTurn: 10,
            capacityPools: { care: { capacityType: "care", availableThroughput: 7 } },
            programs: {
              coverage: { programId: "coverage", annualDemand: 100, obligated: 10, arrears: 4 },
            },
          },
        },
      },
      {
        _id: "US",
        countryId: "US",
        currencyCode: "USD",
        treasuryBalance: 200,
        treasuryCashLocal: 30,
        debt: { principal: 0 },
        defenseAppropriation: { balance: 40, encumbered: 12, accruedThroughTurn: 10 },
        intelligenceAppropriation: { balance: 9, accruedThroughTurn: 10 },
        departmentAccounts: {},
      },
    ]);
    const run = (db = f.db) =>
      mergeNationalFisc(db, { fromCountryId: "CA", toCountryId: "US", currentTurn: 10 });
    const fault = withInjectedCrash(f.memory, {
      collection: "federalBudget",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(run(fault.db)).rejects.toThrow();
    expect(f.memory.collection("federalBudget").docs[1]).toMatchObject({
      treasuryCashLocal: 30,
      treasuryBalance: 200,
    });
    await Promise.all([run(), run()]);
    expect(f.memory.collection("federalBudget").docs[1]).toMatchObject({
      treasuryCashLocal: 50,
      treasuryBalance: 400,
      defenseAppropriation: {
        balance: 80,
        encumbered: 22,
        governmentTenderReservations: { one: { amount: 10 } },
      },
      intelligenceAppropriation: { balance: 21 },
      departmentAccounts: {
        health: {
          balance: 60,
          encumbered: 20,
          arrears: 8,
          capacityPools: { care: { availableThroughput: 7 } },
          programs: { coverage: { annualDemand: 200, obligated: 20, arrears: 8 } },
        },
      },
    });
    expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
      treasuryCashLocal: 0,
      treasuryBalance: 0,
      defenseAppropriation: { balance: 0, encumbered: 0 },
      intelligenceAppropriation: { balance: 0 },
      departmentAccounts: {},
    });
  });
  it("preserves GDP, macro capital, budget cash/debt and resource stocks through a region fusion retry", async () => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("states", [
      {
        _id: "A",
        countryId: "CA",
        population: 100,
        gdp: 100,
        capitalStock: 500,
        conflictCapacityApplied: { loss: { destroyed: 5, repaired: 2 } },
      },
      {
        _id: "B",
        countryId: "CA",
        population: 200,
        gdp: 200,
        capitalStock: 1000,
        conflictCapacityApplied: { loss: { destroyed: 10, repaired: 3 } },
        subhourBase: { old: true },
      },
    ]);
    f.memory.seed("stateBudgets", [
      { _id: "A", countryId: "CA", balance: 10 },
      { _id: "B", countryId: "CA", balance: 20 },
    ]);
    f.memory.seed("regionalBudgets", [
      { _id: "A", countryId: "CA", financing: { principal: 10, cash: 5, annualInterest: 0.5 } },
      { _id: "B", countryId: "CA", financing: { principal: 20, cash: 7, annualInterest: 1 } },
    ]);
    f.memory.seed("stateResourceCapacity", [
      {
        _id: new ObjectId(),
        stateId: "A",
        countryId: "CA",
        resources: { oil: 100 },
        extractedUnits: { oil: 10 },
      },
      {
        _id: new ObjectId(),
        stateId: "B",
        countryId: "CA",
        resources: { oil: 200 },
        extractedUnits: { oil: 20 },
      },
    ]);
    await f.memory
      .collection("stateResourceCapacity")
      .createIndex({ stateId: 1 }, { unique: true });
    const run = (db = f.db) =>
      mergeRegion(db, { fromRegionId: "A", toRegionId: "B", currentTurn: 10 });
    const fault = withInjectedCrash(f.memory, {
      collection: "states",
      op: "deleteOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(run(fault.db)).rejects.toThrow();
    expect(f.memory.collection("states").docs).toHaveLength(2);
    expect(f.memory.collection("stateBudgets").docs[1].balance).toBe(20);
    await Promise.all([run(), run()]);
    expect(f.memory.collection("states").docs).toHaveLength(1);
    expect(f.memory.collection("states").docs[0]).toMatchObject({
      _id: "B",
      population: 300,
      gdp: 300,
      capitalStock: 1500,
      conflictCapacityApplied: { loss: { destroyed: 15, repaired: 5 } },
    });
    expect(f.memory.collection("states").docs[0]).not.toHaveProperty("subhourBase");
    expect(f.memory.collection("stateBudgets").docs).toHaveLength(1);
    expect(f.memory.collection("stateBudgets").docs[0].balance).toBe(30);
    expect(f.memory.collection("regionalBudgets").docs[0]).toMatchObject({
      _id: "B",
      financing: { principal: 30, cash: 12, annualInterest: 1.5 },
    });
    expect(f.memory.collection("stateResourceCapacity").docs[0]).toMatchObject({
      stateId: "B",
      resources: { oil: 300 },
      extractedUnits: { oil: 30 },
    });
  });
});
