import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { processRegionalDebt } from "./regionalDebtTurn";
vi.mock("@/lib/country/countryTier", () => ({
  loadCountryTiers: vi.fn(async () => ({ fullSimulationIds: ["US", "CA"] })),
}));
function fixture() {
  const db = createMockDb();
  const state = {
    _id: "TX",
    countryId: "US",
    revenue: { total: 4800 },
    spending: { total: 9600 },
    balance: 0,
  };
  const region = { _id: "ON", countryId: "CA", totalBudget: 4800, enactedBillCosts: 9600 };
  const rows: Record<string, Record<string, unknown>[]> = {
    stateBudgets: [state],
    regionalBudgets: [region],
  };
  for (const name of Object.keys(rows)) {
    const coll = db.collection(name);
    coll.find.mockImplementation(() => ({ toArray: async () => rows[name] }));
    coll.bulkWrite.mockImplementation(
      async (
        ops: { updateOne: { filter: { _id: string }; update: { $set: Record<string, unknown> } } }[]
      ) => {
        for (const op of ops) {
          const row = rows[name].find((r) => r._id === op.updateOne.filter._id)!;
          for (const [key, value] of Object.entries(op.updateOne.update.$set)) {
            const [parent, child] = key.split(".");
            if (child) (row[parent] as Record<string, unknown>)[child] = value;
            else row[key] = value;
          }
        }
        return { matchedCount: ops.length };
      }
    );
  }
  return { db, state, region, rows };
}
describe("regional debt turn", () => {
  it("applies compare-and-set updates against a matching document store", async () => {
    const db = createInMemoryDb() as unknown as Db;
    await db.collection("stateBudgets").insertOne({
      _id: "TX" as never,
      countryId: "US",
      balance: 0,
      revenue: { total: 4800 },
      spending: { total: 9600 },
    });
    await db.collection("regionalBudgets").insertOne({
      _id: "ON" as never,
      countryId: "CA",
      totalBudget: 4800,
      enactedBillCosts: 9600,
    });
    await processRegionalDebt(db, 1);
    expect(await processRegionalDebt(db, 1)).toEqual({ regionsProcessed: 0 });
    await processRegionalDebt(db, 2);
    const state = await db.collection("stateBudgets").findOne({ _id: "TX" as never });
    const region = await db.collection("regionalBudgets").findOne({ _id: "ON" as never });
    expect(state?.financing).toMatchObject({ principal: 200.1, borrowed: 100.1 });
    expect(region?.financing).toMatchObject({ principal: 200.1, borrowed: 100.1 });
  });

  it.each(["revenue", "authority"] as const)(
    "retries a concurrent %s change with the new funding inputs",
    async (kind) => {
      const db = createInMemoryDb() as unknown as Db;
      const states = db.collection("stateBudgets");
      await states.insertOne({
        _id: "TX" as never,
        countryId: "US",
        balance: 0,
        revenue: { total: 4800 },
        spending: { total: 9600 },
      });
      const bulkWrite = states.bulkWrite.bind(states);
      vi.spyOn(states, "bulkWrite").mockImplementationOnce(async (ops) => {
        await states.updateOne(
          { _id: "TX" as never },
          {
            $set:
              kind === "revenue"
                ? { "revenue.total": 9600 }
                : { authorizedSpending: { total: 14400 } },
          }
        );
        return bulkWrite(ops);
      });
      await expect(processRegionalDebt(db, 1)).rejects.toThrow("retry required");
      expect((await states.findOne({ _id: "TX" as never }))?.financing).toBeUndefined();
      await processRegionalDebt(db, 1);
      expect((await states.findOne({ _id: "TX" as never }))?.financing.principal).toBe(
        kind === "revenue" ? 0 : 200
      );
    }
  );

  it("settles both budget models once and preserves the same-turn retry", async () => {
    const { db, rows } = fixture();
    await processRegionalDebt(db as unknown as Db, 1);
    expect(rows.stateBudgets[0].financing).toMatchObject({ principal: 100, cash: 0 });
    expect(rows.regionalBudgets[0].financing).toMatchObject({ principal: 100, cash: 0 });
    expect(
      db.collectionMocks.stateBudgets.bulkWrite.mock.calls[0][0][0].updateOne.filter
    ).toMatchObject({
      countryId: "US",
      balance: 0,
      "financing.lastSettledTurn": { $exists: false },
    });
    expect(await processRegionalDebt(db as unknown as Db, 1)).toEqual({ regionsProcessed: 0 });
    expect(db.collectionMocks.stateBudgets.bulkWrite).toHaveBeenCalledOnce();
    await processRegionalDebt(db as unknown as Db, 2);
    expect(rows.stateBudgets[0].financing).toMatchObject({ principal: 200.1, annualInterest: 5 });
    expect(rows.stateBudgets[0].spending).toMatchObject({ total: 9605, interestPayments: 5 });
    expect(rows.regionalBudgets[0].interestPayments).toBe(5);
  });
  it("funds authorized services and publishes current annual delivery proof", async () => {
    const { db, rows } = fixture();
    rows.stateBudgets[0].authorizedSpending = {
      total: 9600,
      byCategory: { resetLegislation: 9600 },
    };
    rows.stateBudgets[0].spending = { total: 4800, byCategory: { resetLegislation: 4800 } };
    rows.stateBudgets[0].regionalProgramSettlements = {
      law: {
        programId: "law",
        legislationTypeId: "L19",
        policyOptionId: "far_left",
        authorizedCost: 9600,
        obligationPriority: 5,
        fundedAmount: 0,
        unfundedAmount: 9600,
        implementationFactor: 0,
        lastSettledTurn: 0,
      },
    };
    await processRegionalDebt(db as unknown as Db, 1);
    expect(rows.stateBudgets[0].financing).toMatchObject({ borrowed: 100 });
    expect(rows.stateBudgets[0].spending).toMatchObject({ total: 9600 });
    expect(rows.stateBudgets[0].regionalProgramSettlements).toMatchObject({
      law: {
        fundedAmount: 9600,
        unfundedAmount: 0,
        implementationFactor: 1,
        lastSettledTurn: 1,
        validThroughTurn: 1,
      },
    });
  });

  it("recovers after only the state batch was applied", async () => {
    const { db, rows } = fixture();
    db.collectionMocks.regionalBudgets.bulkWrite.mockRejectedValueOnce(new Error("interrupted"));
    await expect(processRegionalDebt(db as unknown as Db, 1)).rejects.toThrow("interrupted");
    await processRegionalDebt(db as unknown as Db, 1);
    expect(rows.stateBudgets[0].financing).toMatchObject({ principal: 100 });
    expect(rows.regionalBudgets[0].financing).toMatchObject({ principal: 100 });
    expect(db.collectionMocks.stateBudgets.bulkWrite).toHaveBeenCalledOnce();
  });
  it("fails on a competing budget update instead of silently losing financing", async () => {
    const { db } = fixture();
    db.collectionMocks.stateBudgets.bulkWrite.mockResolvedValueOnce({ matchedCount: 0 });
    await expect(processRegionalDebt(db as unknown as Db, 1)).rejects.toThrow("retry required");
  });
  it("uses the authoritative parliamentary budget and batches any number of regions", async () => {
    const { db, rows } = fixture();
    rows.stateBudgets.push({
      _id: "ON",
      countryId: "CA",
      balance: 0,
      revenue: { total: 4800 },
      spending: { total: 9600 },
    });
    for (let i = 0; i < 100; i++)
      rows.stateBudgets.push({
        _id: `R${i}`,
        countryId: "US",
        balance: 0,
        revenue: { total: 4800 },
        spending: { total: 9600 },
      });
    expect(await processRegionalDebt(db as unknown as Db, 1)).toEqual({ regionsProcessed: 102 });
    expect(rows.stateBudgets[1].financing).toBeUndefined();
    expect(db.collectionMocks.stateBudgets.find).toHaveBeenCalledOnce();
    expect(db.collectionMocks.regionalBudgets.find).toHaveBeenCalledOnce();
    expect(db.collectionMocks.stateBudgets.bulkWrite).toHaveBeenCalledOnce();
    expect(db.collectionMocks.regionalBudgets.bulkWrite).toHaveBeenCalledOnce();
  });
});
