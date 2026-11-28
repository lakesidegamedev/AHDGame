import { expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { withSessionDb } from "@/lib/db/sessionDb";
import { creditRegionalCash } from "./regionalCash";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
it("credits only canonical parliamentary cash, keeps the mirror untouched, and recovers lost acknowledgements once", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("regionalBudgets", [
    { _id: "ON", countryId: "CA", financing: { principal: 500, cash: 20, lastSettledTurn: 8 } },
  ]);
  memory.seed("stateBudgets", [
    { _id: "ON", countryId: "CA", balance: 17 },
    { _id: "TX", countryId: "US", balance: 100 },
  ]);
  const rows = [
    { stateId: "ON", countryId: "CA", amount: 12 },
    { stateId: "TX", countryId: "US", amount: 8 },
  ];
  const options = { receipt: { key: "tax:9", turn: 9 } };
  const fault = withInjectedCrash(memory, {
    collection: "regionalBudgets",
    op: "bulkWrite",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(
    withSessionDb(fault.db, (db) => creditRegionalCash(db, rows, options))
  ).rejects.toThrow();
  expect(memory.collection("regionalBudgets").docs[0].financing).toMatchObject({
    principal: 500,
    cash: 20,
  });
  expect(memory.collection("stateBudgets").docs.map((row) => row.balance)).toEqual([17, 100]);
  fault.disarm();
  await Promise.all([
    withSessionDb(db, (db) => creditRegionalCash(db, rows, options)),
    withSessionDb(db, (db) => creditRegionalCash(db, rows, options)),
  ]);
  expect(memory.collection("regionalBudgets").docs[0].financing).toMatchObject({
    principal: 500,
    cash: 32,
  });
  expect(memory.collection("stateBudgets").docs.map((row) => row.balance)).toEqual([17, 108]);
});
it("initializes a region's financing cash without changing its fiscal flows", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("regionalBudgets", [
    { _id: "ON", countryId: "CA", totalBudget: 500, enactedBillCosts: 600 },
  ]);
  await withSessionDb(db, (db) =>
    creditRegionalCash(db, [{ stateId: "ON", countryId: "CA", amount: 10 }])
  );
  expect(memory.collection("regionalBudgets").docs[0]).toMatchObject({
    totalBudget: 500,
    enactedBillCosts: 600,
    financing: { principal: 0, cash: 10, lastSettledTurn: 0 },
  });
  expect(memory.collection("stateBudgets").docs).toHaveLength(0);
});
