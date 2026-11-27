import { expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { preflightCashPrecision } from "./preflightCashPrecision";
import type { MoneyMoveLeg } from "./moneyMove";
it.each([20, 2000])(
  "reads %i recipients once, projecting only identity and cash",
  async (count) => {
    const memory = createInMemoryDb();
    const rows = Array.from({ length: count }, (_, i) => ({
      _id: `recipient:${i}`,
      cash: 1e6,
      unrelated: "not needed",
    }));
    memory.seed("wallets", rows);
    const read = vi.spyOn(memory.collection("wallets"), "find");
    const legs: MoneyMoveLeg[] = rows.map((row) => ({
      kind: "credit",
      collection: "wallets",
      filter: { _id: row._id },
      path: "cash",
      amount: 100,
      note: "synthetic",
    }));
    expect(await preflightCashPrecision(memory as unknown as Db, legs)).toBe(true);
    expect(read).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(
      { _id: { $in: rows.map((row) => row._id) } },
      { projection: { _id: 1, cash: 1 } }
    );
    expect(memory.collection("wallets").docs).toEqual(rows);
  }
);
it("groups native currency fields without loading each wallet separately", async () => {
  const memory = createInMemoryDb();
  memory.seed("wallets", [{ _id: "mixed", cash: { USD: 1e6, CAD: 1e6, JPY: 1e6 } }]);
  const read = vi.spyOn(memory.collection("wallets"), "find");
  const legs: MoneyMoveLeg[] = ["USD", "CAD", "JPY"].map((currency) => ({
    kind: "debit",
    collection: "wallets",
    filter: { _id: "mixed" },
    path: `cash.${currency}`,
    amount: 100,
    note: currency,
  }));
  expect(await preflightCashPrecision(memory as unknown as Db, legs)).toBe(true);
  expect(read).toHaveBeenCalledOnce();
  expect(read).toHaveBeenCalledWith(
    { _id: { $in: ["mixed"] } },
    { projection: { _id: 1, "cash.USD": 1, "cash.CAD": 1, "cash.JPY": 1 } }
  );
});
it("refuses a materially rounded recipient without mutating any wallet", async () => {
  const memory = createInMemoryDb();
  memory.seed("wallets", [{ _id: "large", cash: 1e18 }]);
  expect(
    await preflightCashPrecision(memory as unknown as Db, [
      {
        kind: "credit",
        collection: "wallets",
        filter: { _id: "large" },
        path: "cash",
        amount: 100,
        note: "synthetic",
      },
    ])
  ).toBe(false);
  expect(memory.collection("wallets").docs[0].cash).toBe(1e18);
});
