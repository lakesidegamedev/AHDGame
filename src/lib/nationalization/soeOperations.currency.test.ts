import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { processSoeOperations, buildRdModernizationOps } from "./soeOperations";
it("compares modernization spending with revenue in the owner's denomination", async () => {
  const memory = createInMemoryDb(),
    id = new ObjectId(),
    now = new Date();
  const corp = {
    _id: id,
    countryId: "CA",
    countryOwnerId: "CA",
    liquidCurrencyCode: "CAD",
    liquidCapital: 0,
    rdScore: 0,
    rdBudgetPerTurn: 50,
  };
  memory.seed("gameState", [{ _id: "current", preset: "2019-default" }]);
  memory.seed("corporations", [corp]);
  memory.seed("federalBudget", [
    { _id: "CA", countryId: "CA", currencyCode: "CAD", treasuryBalance: 1000 },
  ]);
  memory.seed("exchangeRates", [
    { _id: "CAD", currencyCode: "CAD", rate: 1 },
    { _id: "ITL", currencyCode: "ITL", rate: 1000 },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: new ObjectId(),
      corporationId: id,
      countryId: "CA",
      stateId: "CA_ON",
      sectorType: "energy",
      revenue: 1000,
    },
    {
      _id: new ObjectId(),
      corporationId: id,
      countryId: "IT",
      stateId: "IT_LAZ",
      sectorType: "energy",
      revenue: 1_000_000,
    },
  ]);
  await processSoeOperations(memory as never, now);
  const expected = buildRdModernizationOps([corp], new Map([[id.toString(), 2000]]), now)[0]
    .updateOne.update.$set.rdScore;
  expect(memory.collection("corporations").docs[0].rdScore).toBe(expected);
  expect(memory.collection("corporations").docs[0].liquidCapital).toBe(0);
  expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(1000);
});
