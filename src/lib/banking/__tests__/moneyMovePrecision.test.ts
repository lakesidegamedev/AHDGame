import { expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { applyMoneyMove, resumeMoneyMove, type MoneyMove } from "../moneyMove";
function fixture(balance: number, amount: number) {
  const memory = createInMemoryDb();
  memory.seed("accounts", [
    { _id: "source", balance },
    { _id: "recipient", balance: 0 },
  ]);
  const move: MoneyMove = {
    key: "precision",
    kind: "test",
    legs: [
      {
        kind: "debit",
        collection: "accounts",
        filter: { _id: "source" },
        path: "balance",
        amount,
        note: "out",
      },
      {
        kind: "credit",
        collection: "accounts",
        filter: { _id: "recipient" },
        path: "balance",
        amount,
        note: "in",
      },
    ],
  };
  return { memory, db: memory as unknown as Db, move };
}
it("does not certify a debit that leaves a very large stored balance unchanged", async () => {
  const f = fixture(1e18, 1);
  expect((await applyMoneyMove(f.db, f.move)).status).not.toBe("applied");
  await resumeMoneyMove(f.db, f.move.key);
  expect(f.memory.collection("accounts").docs.map((row) => row.balance)).toEqual([1e18, 0]);
  expect(
    (f.memory.collection("bankMoneyMoves").docs[0].legs as { applied: boolean }[]).every(
      (leg) => !leg.applied
    )
  ).toBe(true);
});
it("keeps large representable turn payments and cent-sized transfers working", async () => {
  const f = fixture(1e12, 0.01);
  expect((await applyMoneyMove(f.db, f.move)).status).toBe("applied");
  expect(f.memory.collection("accounts").docs[1].balance).toBe(0.01);
  expect(f.memory.collection("accounts").docs[0].balance).toBe(1e12 - 0.01);
  expect((await resumeMoneyMove(f.db, f.move.key)).status).toBe("applied");
  expect(f.memory.collection("accounts").docs[1].balance).toBe(0.01);
});
it("rejects overflowing credits rather than recording an infinite balance", async () => {
  const f = fixture(1e308, 1e308);
  f.memory.collection("accounts").docs[1].balance = 1e308;
  const result = await applyMoneyMove(f.db, f.move);
  expect(result.status).not.toBe("applied");
  expect(f.memory.collection("accounts").docs[1].balance).toBe(1e308);
});
