import { describe, expect, it, vi } from "vitest";
import { treasuryTransactionsCollection } from "./treasuryTransactions";
import type { CollectionSource } from "./source";

describe("treasuryTransactions repository", () => {
  it("opens treasuryTransactions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = treasuryTransactionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("treasuryTransactions");
    expect(handle).toEqual({ name: "treasuryTransactions" });
  });
});
