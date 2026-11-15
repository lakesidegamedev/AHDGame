import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { applyMoneyMove } from "@/lib/banking/moneyMove";
import { householdOpeningMoves } from "@/lib/market/producerMarket/liveFundingRules";
import { householdOpeningAlreadyApplied, reconcileAppliedFunding } from "../fundingRetryReconcile";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const opening = (amountLocal: number) =>
  householdOpeningMoves("epoch", "test approval", [
    { walletId: "households:LON", amountLocal, currencyCode: "GBP", localPerAnchor: 0.78 },
  ])[0];

describe("one-time household opening seed on a retried first funded turn", () => {
  it("counts an already applied seed as done when the retry's amount differs", async () => {
    const memory = createInMemoryDb();
    memory.seed("producerEconomyAccounts", [{ _id: "households:LON", cash: 0 }]);
    const db = memory as unknown as Db;
    expect((await applyMoneyMove(db, opening(60192.77))).status).toBe("applied");
    // A retry rebuilds the seed from that attempt's wage bill: the journal refuses it,
    // and the reconcile path does not cover a move without a turn.
    const retry = opening(60427.16);
    expect((await applyMoneyMove(db, retry)).status).toBe("rejected");
    expect(await reconcileAppliedFunding(db, retry)).toBe(false);
    expect(await householdOpeningAlreadyApplied(db, retry)).toBe(true);
    // The seed is not paid twice.
    expect(memory.collection("producerEconomyAccounts").docs[0].cash).toBeCloseTo(60192.77, 6);
  });

  it("does not treat other moves or a seed that never landed as done", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    expect(await householdOpeningAlreadyApplied(db, opening(1))).toBe(false);
    expect(
      await householdOpeningAlreadyApplied(db, { ...opening(1), kind: "producer_public_funding" })
    ).toBe(false);
  });
});
