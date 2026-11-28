import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { migration as funds } from "./2026-06-01-index-fund-seed";
import { migration as renewables } from "./2026-11-16-split-renewables-power-method";
import { getAllFundDefinitions } from "@/lib/indexFunds/fundDefinitions";
it("preserves a traded reserve and creates missing custody from its current authority", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  const fundId = new ObjectId(),
    otherId = new ObjectId();
  const definitions = getAllFundDefinitions();
  memory.seed("indexFunds", [
    {
      _id: fundId,
      slug: definitions[0].slug,
      reserveUnits: 120,
      quotedNav: 2,
      cashAnchor: 240,
      unitSupply: 200,
    },
    {
      _id: otherId,
      slug: definitions[1].slug,
      reserveUnits: 35,
      quotedNav: 3,
      cashAnchor: 105,
      unitSupply: 50,
    },
  ]);
  memory.seed("indexFundPositions", [
    { _id: new ObjectId(), fundId, holderKind: "fund_reserve", units: 120, avgNavAnchor: 2 },
  ]);
  await funds.execute(db, { dryRun: false });
  await funds.execute(db, { dryRun: false });
  expect(
    memory
      .collection("indexFundPositions")
      .docs.find((row) => String(row.fundId) === String(fundId))?.units
  ).toBe(120);
  expect(
    memory
      .collection("indexFundPositions")
      .docs.find((row) => String(row.fundId) === String(otherId))?.units
  ).toBe(35);
  expect(
    memory.collection("indexFunds").docs.find((row) => String(row._id) === String(fundId))
      ?.cashAnchor
  ).toBe(240);
});
it.each(["updateOne", "insertOne"] as const)(
  "keeps wind and solar delivery atomic after a landed %s",
  async (op) => {
    const { memory } = createTransactionalMemoryDb();
    memory.seed("subsidies", [
      { _id: new ObjectId(), targetStrategyId: "renewables", rate: 0.1, countryId: "US" },
    ]);
    const fault = withInjectedCrash(memory, {
      collection: "subsidies",
      op,
      onCall: 1,
      afterWrite: true,
    });
    await expect(renewables.execute(fault.db, { dryRun: false })).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("subsidies").docs.map((row) => row.targetStrategyId)).toEqual([
      "renewables",
    ]);
    await renewables.execute(fault.db, { dryRun: false });
    await renewables.execute(fault.db, { dryRun: false });
    expect(
      memory
        .collection("subsidies")
        .docs.map((row) => row.targetStrategyId)
        .sort()
    ).toEqual(["solar", "wind"]);
  }
);
it("overlapping subsidy migrations publish a single solar companion", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("subsidies", [{ _id: new ObjectId(), targetStrategyId: "renewables", rate: 0.1 }]);
  await Promise.all([
    renewables.execute(db, { dryRun: false }),
    renewables.execute(db, { dryRun: false }),
  ]);
  expect(memory.collection("subsidies").docs).toHaveLength(2);
});
