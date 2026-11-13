import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { applyMoneyMove, resumeMoneyMove } from "../moneyMove";
import { withSettlementReadSnapshot } from "../settlementReadSnapshot";
import { settleTransition } from "../settlementJournal";
import type { BankingTransition } from "../rules/boundary";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

function fixture() {
  const memory = createInMemoryDb();
  memory.seed("accounts", [{ _id: "wallet", balance: 0 }]);
  const move = (key: string) => ({
    key,
    kind: "snapshot-test",
    turn: 1,
    legs: [
      { kind: "mint" as const, amount: 10, note: "Fund test" },
      {
        kind: "credit" as const,
        collection: "accounts",
        filter: { _id: "wallet" },
        path: "balance",
        amount: 10,
        note: "Credit wallet",
      },
    ],
  });
  return { memory, db: memory as unknown as Db, move };
}

describe("settlement phase read snapshots", () => {
  it("refreshes a cached generation after a different worker changes the target", async () => {
    const f = fixture();
    await withSettlementReadSnapshot(async () => {
      await applyMoneyMove(f.db, f.move("one"));
      await withSettlementReadSnapshot(() => applyMoneyMove(f.db, f.move("two")));
      expect((await applyMoneyMove(f.db, f.move("three"))).status).toBe("applied");
    });
    expect(f.memory.collection("accounts").docs[0].balance).toBe(30);
  });

  it("does not repeat a leg another worker delivered after the cached target was read", async () => {
    const f = fixture();
    await withSettlementReadSnapshot(async () => {
      await applyMoneyMove(f.db, f.move("one"));
      const journal = f.memory.collection("bankMoneyMoves");
      const insert = journal.insertOne.bind(journal);
      vi.spyOn(journal, "insertOne").mockImplementation(async (doc) => {
        const result = await insert(doc);
        if (doc._id === "two") await withSettlementReadSnapshot(() => resumeMoneyMove(f.db, "two"));
        return result;
      });
      expect((await applyMoneyMove(f.db, f.move("two"))).status).toBe("applied");
    });
    expect(f.memory.collection("accounts").docs[0].balance).toBe(20);
  });

  it("keeps projection generations authoritative across competing phase snapshots", async () => {
    const f = fixture();
    const transition = (key: string): BankingTransition => ({
      key,
      kind: "snapshot-projection",
      turn: 1,
      currency: "USD",
      legs: [],
      projections: [
        {
          collection: "accounts",
          filter: { _id: "wallet" },
          update: { $inc: { balance: 10 } },
          note: "Update target",
        },
      ],
      event: { kind: "bank.resolved", command: "snapshot-test" },
    });
    await withSettlementReadSnapshot(async () => {
      await settleTransition(f.db, transition("one"));
      await withSettlementReadSnapshot(() => settleTransition(f.db, transition("two")));
      expect((await settleTransition(f.db, transition("three"))).status).toBe("applied");
    });
    expect(f.memory.collection("accounts").docs[0].balance).toBe(30);
  });
});
