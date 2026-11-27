import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processLotteryAnnuities } from "./annuity";

it.each(["characters", "bankMoneyMoves"])(
  "keeps the installment and proof together after a landed %s write",
  async (collection) => {
    const { memory } = createTransactionalMemoryDb();
    memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
    memory.seed("characters", [
      {
        _id: new ObjectId(),
        politicalInfluence: 0,
        preeLotteryAnnuity: { piPerTurn: 5, turnsRemaining: 3 },
      },
    ]);
    const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
    await expect(processLotteryAnnuities(fault.db, 5)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("characters").docs[0]).toMatchObject({
      politicalInfluence: 0,
      preeLotteryAnnuity: { turnsRemaining: 3 },
    });
    expect(await processLotteryAnnuities(fault.db, 5)).toBe(1);
    expect(await processLotteryAnnuities(fault.db, 5)).toBe(1);
    expect(memory.collection("characters").docs[0]).toMatchObject({
      politicalInfluence: 5,
      preeLotteryAnnuity: { turnsRemaining: 2 },
    });
    expect(await processLotteryAnnuities(fault.db, 6)).toBe(1);
    expect(memory.collection("characters").docs[0]).toMatchObject({
      politicalInfluence: 10,
      preeLotteryAnnuity: { turnsRemaining: 1 },
    });
  }
);
