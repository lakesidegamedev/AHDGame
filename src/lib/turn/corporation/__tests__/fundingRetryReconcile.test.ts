import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { applyMoneyMove, type MoneyMove } from "@/lib/banking/moneyMove";
import { reconcileAppliedFunding } from "../fundedProducerTurn";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const v = { currencyCode: "ATS", localPerAnchor: 10 };
const batch = (amounts: Record<string, number>): MoneyMove => ({
  key: "producer_investment_funding-batch:epoch:697",
  kind: "producer_investment_funding",
  turn: 697,
  record: { batchIndependentDebits: true },
  legs: Object.entries(amounts).flatMap(([id, amount]) => [
    { kind: "mint" as const, amount, valuation: v, note: "work" },
    {
      kind: "credit" as const,
      amount,
      valuation: v,
      collection: "producerEconomyAccounts",
      filter: { _id: id },
      path: "cash",
      note: "buyer",
    },
  ]),
});

describe("turn 697: a funding batch applied by a failed attempt", () => {
  it("is brought to each retry's amounts instead of stalling the turn", async () => {
    const memory = createInMemoryDb();
    memory.seed("producerEconomyAccounts", [
      { _id: "a", cash: 0 },
      { _id: "b", cash: 0 },
      { _id: "c", cash: 0 },
    ]);
    const db = memory as unknown as Db;
    expect((await applyMoneyMove(db, batch({ a: 100, b: 50 }))).status).toBe("applied");
    // The retry computes different amounts under the same key: the journal refuses it.
    const retry = batch({ a: 120, b: 30, c: 5 });
    expect((await applyMoneyMove(db, retry)).status).toBe("rejected");
    expect(await reconcileAppliedFunding(db, retry)).toBe(true);
    const cash = async () =>
      Object.fromEntries(
        memory.collection("producerEconomyAccounts").docs.map((d) => [d._id, d.cash])
      );
    expect(await cash()).toEqual({ a: 120, b: 30, c: 5 });
    // The same retry again changes nothing; a later retry corrects from the corrected base.
    expect(await reconcileAppliedFunding(db, retry)).toBe(true);
    expect(await cash()).toEqual({ a: 120, b: 30, c: 5 });
    expect(await reconcileAppliedFunding(db, batch({ a: 90, b: 30 }))).toBe(true);
    expect(await cash()).toEqual({ a: 90, b: 30, c: 0 });
  });

  it("leaves other rejections alone", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    expect(await reconcileAppliedFunding(db, batch({ a: 1 }))).toBe(false);
    const debit: MoneyMove = {
      key: "x",
      kind: "k",
      turn: 1,
      legs: [
        {
          kind: "debit",
          amount: 1,
          collection: "c",
          filter: { _id: "a" },
          path: "cash",
          note: "n",
        },
      ],
    };
    expect(await reconcileAppliedFunding(db, debit)).toBe(false);
  });
});
