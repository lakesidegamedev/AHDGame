import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { latestCompleteCycle, processPartyRenewal } from "./partyRenewal";

function makeDb(gameState: Record<string, unknown> | null) {
  const findOne = vi.fn().mockResolvedValue(gameState);
  const collection = vi.fn(() => ({ findOne }));
  return { db: { collection } as unknown as Db, collection, findOne };
}

describe("processPartyRenewal gate", () => {
  it("reads nothing off its check interval", async () => {
    const { db, collection } = makeDb({ nppPartyRenewalEnabled: true });
    await processPartyRenewal(db, 7);
    expect(collection).not.toHaveBeenCalled();
  });

  it("stops at the flag read when the flag is absent or false", async () => {
    for (const gameState of [{}, { nppPartyRenewalEnabled: false }, null]) {
      const { db, collection } = makeDb(gameState);
      expect(await processPartyRenewal(db, 6)).toEqual({
        countries: 0,
        splinters: 0,
        foundings: 0,
        folds: 0,
      });
      expect(collection).toHaveBeenCalledTimes(1);
      expect(collection).toHaveBeenCalledWith("gameState");
    }
  });
});

describe("latestCompleteCycle", () => {
  it("picks the newest cycle whose races have all resolved", () => {
    expect(
      latestCompleteCycle(
        [
          { cycle: 1, status: "resolved" },
          { cycle: 2, status: "resolved" },
          { cycle: 2, status: "resolved" },
          { cycle: 3, status: "active" },
          { cycle: 3, status: "resolved" },
        ],
        0
      )
    ).toBe(2);
  });

  it("ignores cycles already evaluated", () => {
    expect(latestCompleteCycle([{ cycle: 2, status: "resolved" }], 2)).toBeNull();
  });
});
