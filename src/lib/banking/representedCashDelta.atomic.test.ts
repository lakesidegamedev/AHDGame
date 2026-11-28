import { it, expect, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { applyMoneyMove } from "@/lib/banking/moneyMove";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
it.each([true, false])(
  "does not certify a nominal transfer whose stored delta differs (large source=%s)",
  async (largeSource) => {
    const f = createTransactionalMemoryDb();
    const sourceBefore = largeSource ? 1e18 : 1000,
      recipientBefore = largeSource ? 0 : 1e18;
    f.memory.seed("wallets", [
      { _id: "source", cash: sourceBefore },
      { _id: "recipient", cash: recipientBefore },
    ]);
    const result = await applyMoneyMove(f.db, {
      key: "precision-rounded:" + largeSource,
      kind: "synthetic-transfer",
      legs: [
        {
          kind: "debit",
          amount: 100,
          collection: "wallets",
          filter: { _id: "source" },
          path: "cash",
          note: "source",
        },
        {
          kind: "credit",
          amount: 100,
          collection: "wallets",
          filter: { _id: "recipient" },
          path: "cash",
          note: "recipient",
        },
      ],
    });
    expect(result.status).toBe("rejected");
    const source = await f.db
      .collection<{ _id: string; cash: number }>("wallets")
      .findOne({ _id: "source" });
    const recipient = await f.db
      .collection<{ _id: string; cash: number }>("wallets")
      .findOne({ _id: "recipient" });
    const debited = sourceBefore - source!.cash,
      credited = recipient!.cash - recipientBefore;
    expect(debited).toBe(credited);
  }
);

it.each([0.01, 0.1, 100])("preserves normal cash transfers and retries for %s", async (amount) => {
  const f = createTransactionalMemoryDb();
  f.memory.seed("wallets", [
    { _id: "source", cash: 1000 },
    { _id: "recipient", cash: 5 },
  ]);
  const command = {
    key: "normal:" + amount,
    kind: "synthetic-transfer",
    legs: [
      {
        kind: "debit" as const,
        amount,
        collection: "wallets",
        filter: { _id: "source" },
        path: "cash",
        note: "source",
      },
      {
        kind: "credit" as const,
        amount,
        collection: "wallets",
        filter: { _id: "recipient" },
        path: "cash",
        note: "recipient",
      },
    ],
  };
  await applyMoneyMove(f.db, command);
  await applyMoneyMove(f.db, command);
  const rows = await f.db.collection<{ _id: string; cash: number }>("wallets").find({}).toArray();
  expect(rows.find((r) => r._id === "source")!.cash).toBeCloseTo(1000 - amount, 8);
  expect(rows.find((r) => r._id === "recipient")!.cash).toBeCloseTo(5 + amount, 8);
});
