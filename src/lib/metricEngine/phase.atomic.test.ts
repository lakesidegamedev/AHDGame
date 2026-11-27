import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { runMetricEngine } from "./phase";

describe("macro phase publication", () => {
  it("restores macro and GDP inputs if state publication fails, then advances only once", async () => {
    const { memory } = createTransactionalMemoryDb();
    memory.seed("gameState", [{ _id: "current", currentTurn: 5, preset: "2019-default" }]);
    memory.seed("gameConfig", [{ _id: "default" }]);
    memory.seed("states", [
      {
        _id: "TX",
        name: "Fixture",
        countryId: "US",
        population: 100000,
        workingAgePopulation: 70000,
        militaryServicePopulation: 0,
        gdp: 1000,
      },
    ]);
    memory.seed("macroMetrics", [
      {
        _id: "TX",
        countryId: "US",
        economic: {
          gdpGrowth: { value: 2 },
          sectorGrowth: { value: 2 },
          unemploymentRate: { value: 5 },
        },
      },
    ]);
    memory.seed("federalBudget", [
      {
        _id: "federal",
        countryId: "US",
        gdp: 1000000000,
        gdpSmoothed: 1000000000,
        priceIndex: 1,
        taxRates: { salesTax: 0 },
      },
    ]);
    const originalMacro = JSON.stringify(memory.collection("macroMetrics").docs);
    const fault = withInjectedCrash(memory, {
      collection: "states",
      op: "bulkWrite",
      onCall: 1,
      afterWrite: true,
    });
    await expect(runMetricEngine(fault.db, 6)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("states").docs[0].gdp).toBe(1000);
    expect(JSON.stringify(memory.collection("macroMetrics").docs)).toBe(originalMacro);
    expect(memory.collection("federalBudget").docs[0].gdpSmoothed).toBe(1000000000);
    expect(await runMetricEngine(fault.db, 6)).toBe(1);
    const settled = JSON.stringify({
      states: memory.collection("states").docs,
      macro: memory.collection("macroMetrics").docs,
      budgets: memory.collection("federalBudget").docs,
    });
    expect(await runMetricEngine(fault.db, 6)).toBe(1);
    expect(
      JSON.stringify({
        states: memory.collection("states").docs,
        macro: memory.collection("macroMetrics").docs,
        budgets: memory.collection("federalBudget").docs,
      })
    ).toBe(settled);
  });
});
