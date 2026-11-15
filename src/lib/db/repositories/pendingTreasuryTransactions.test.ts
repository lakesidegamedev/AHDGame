import { describe, expect, it, vi } from "vitest";
import { pendingTreasuryTransactionsCollection } from "./pendingTreasuryTransactions";
import type { CollectionSource } from "./source";

describe("pendingTreasuryTransactions repository", () => {
  it("opens pendingTreasuryTransactions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = pendingTreasuryTransactionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("pendingTreasuryTransactions");
    expect(handle).toEqual({ name: "pendingTreasuryTransactions" });
  });
});
