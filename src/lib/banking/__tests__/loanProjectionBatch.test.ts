import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { recoverProjections, settleTransition } from "../settlementJournal";
import type { BankingTransition } from "../rules/boundary";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

function fixture(count = 3) {
  const memory = createInMemoryDb();
  const loans = Array.from({ length: count }, (_, i) => ({
    _id: `loan-${i}`,
    paid: 0,
    status: "current",
  }));
  memory.seed("bankLoans", loans);
  memory.seed("corporations", [{ _id: "bank", completed: 0 }]);
  const transition: BankingTransition = {
    key: "loan-book",
    kind: "npc_book_settlement",
    turn: 4,
    currency: "USD",
    legs: [],
    projections: [
      ...loans.map((loan) => ({
        collection: "bankLoans",
        filter: { _id: loan._id, status: "current" },
        update: { $inc: { paid: 10 } },
        note: "Service loan",
      })),
      {
        collection: "corporations",
        filter: { _id: "bank" },
        update: { $inc: { completed: 1 } },
        note: "Close book",
      },
    ],
    event: { kind: "bank.resolved", command: "loan-book-test" },
  };
  return { memory, db: memory as unknown as Db, transition };
}

describe("batched loan projection acknowledgements", () => {
  it("shares reads and acknowledgements while delivering every loan once", async () => {
    const f = fixture(30);
    const read = vi.spyOn(f.memory.collection("bankLoans"), "findOne");
    const ack = vi.spyOn(f.memory.collection("bankMoneyMoves"), "updateOne");
    expect((await settleTransition(f.db, f.transition)).status).toBe("applied");
    expect(read).not.toHaveBeenCalled();
    expect(ack.mock.calls.length).toBeLessThan(20);
    await settleTransition(f.db, f.transition);
    expect(f.memory.collection("bankLoans").docs.every((loan) => loan.paid === 10)).toBe(true);
    expect(f.memory.collection("corporations").docs[0].completed).toBe(1);
  });

  it("recovers a lost shared acknowledgement without repeating loan or bank writes", async () => {
    const f = fixture();
    const journal = f.memory.collection("bankMoneyMoves");
    const original = journal.updateOne.bind(journal);
    let failed = false;
    vi.spyOn(journal, "updateOne").mockImplementation(async (filter, update, options) => {
      const result = await original(filter, update, options);
      const marks = (!Array.isArray(update) ? update.$set : undefined) as
        Record<string, unknown> | undefined;
      if (
        !failed &&
        marks?.["projections.0.applied"] === true &&
        marks?.["projections.1.applied"] === true
      ) {
        failed = true;
        throw new Error("Shared acknowledgement lost");
      }
      return result;
    });
    await expect(settleTransition(f.db, f.transition)).rejects.toThrow("acknowledgement lost");
    expect((await recoverProjections(f.db, f.transition.key)).status).toBe("applied");
    expect(f.memory.collection("bankLoans").docs.every((loan) => loan.paid === 10)).toBe(true);
    expect(f.memory.collection("corporations").docs[0].completed).toBe(1);
  });

  it("stops at a failed loan guard and retains earlier progress for recovery", async () => {
    const f = fixture();
    await f.db
      .collection("bankLoans")
      .updateOne({ _id: "loan-1" as never }, { $set: { status: "closed" } });
    expect((await settleTransition(f.db, f.transition)).status).toBe("partial");
    expect(f.memory.collection("bankLoans").docs.map((loan) => loan.paid)).toEqual([10, 0, 0]);
    expect(f.memory.collection("corporations").docs[0].completed).toBe(0);
    await f.db
      .collection("bankLoans")
      .updateOne({ _id: "loan-1" as never }, { $set: { status: "current" } });
    expect((await recoverProjections(f.db, f.transition.key)).status).toBe("applied");
    expect(f.memory.collection("bankLoans").docs.map((loan) => loan.paid)).toEqual([10, 10, 10]);
  });
});
