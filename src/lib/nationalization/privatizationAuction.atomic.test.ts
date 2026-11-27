import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import type { NationalizationAuction } from "@/lib/db/types";
import { placeAuctionBid, resolveNationalizationAuction } from "./privatizationAuction";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn(async () => false) }));
vi.mock("./treasuryLedger", () => ({
  loadTreasuryCashContext: vi.fn(async () => ({ treasuryCashLedgerEnabled: false })),
  witnessTreasuryCash: vi.fn(async () => {}),
}));
describe("auction escrow atomicity", () => {
  it.each([false, true])(
    "restores terminal claim and refund after interruption (landed=%s)",
    async (afterWrite) => {
      const { memory } = createTransactionalMemoryDb();
      const bidder = new ObjectId();
      const auction = {
        _id: new ObjectId(),
        corporationId: new ObjectId(),
        countryId: "US",
        status: "open",
        reservePrice: 100,
        reserveCurrency: "USD",
        bids: [{ characterId: bidder, amount: 50, escrowCurrency: "USD", placedAtTurn: 1 }],
      } as NationalizationAuction;
      memory.seed("nationalizationAuctions", [{ ...auction }]);
      memory.seed("characters", [{ _id: bidder, cashOnHand: 0 }]);
      const fault = withInjectedCrash(memory, {
        collection: "characters",
        op: "updateOne",
        onCall: 1,
        afterWrite,
      });
      await expect(resolveNationalizationAuction(fault.db, auction, 5)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(memory.collection("nationalizationAuctions").docs[0].status).toBe("open");
      expect(memory.collection("characters").docs[0].cashOnHand).toBe(0);
      expect(await resolveNationalizationAuction(fault.db, auction, 5)).toBe("passedIn");
      expect(memory.collection("characters").docs[0].cashOnHand).toBe(50);
      expect(await resolveNationalizationAuction(fault.db, auction, 5)).toBe("passedIn");
      expect(memory.collection("characters").docs[0].cashOnHand).toBe(50);
    }
  );
  it("does not strand the new leader's debit when an outbid refund fails", async () => {
    const { memory } = createTransactionalMemoryDb();
    const first = new ObjectId(),
      second = new ObjectId();
    const auction = {
      _id: new ObjectId(),
      corporationId: new ObjectId(),
      countryId: "US",
      status: "open",
      closesAtTurn: 10,
      reservePrice: 100,
      reserveCurrency: "USD",
      bids: [{ characterId: first, amount: 100, escrowCurrency: "USD", placedAtTurn: 1 }],
    } as NationalizationAuction;
    memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
    memory.seed("nationalizationAuctions", [{ ...auction }]);
    memory.seed("characters", [
      { _id: first, countryId: "US", cashOnHand: 0 },
      { _id: second, countryId: "US", cashOnHand: 1000 },
    ]);
    const fault = withInjectedCrash(memory, {
      collection: "characters",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    const run = () =>
      placeAuctionBid(fault.db, {
        auctionId: auction._id,
        characterId: second,
        amount: 200,
        turn: 5,
      });
    await expect(run()).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("characters").docs.map((row) => row.cashOnHand)).toEqual([0, 1000]);
    expect(
      (memory.collection("nationalizationAuctions").docs[0].bids as { characterId: ObjectId }[])[0]
        .characterId
    ).toEqual(first);
    await run();
    expect(memory.collection("characters").docs.map((row) => row.cashOnHand)).toEqual([100, 800]);
    expect(
      (memory.collection("nationalizationAuctions").docs[0].bids as { characterId: ObjectId }[])[0]
        .characterId
    ).toEqual(second);
  });
});
