import { describe, expect, it, vi } from "vitest";
import { indexFundTransactionsCollection } from "./indexFundTransactions";
import type { CollectionSource } from "./source";

describe("indexFundTransactions repository", () => {
  it("opens indexFundTransactions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = indexFundTransactionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("indexFundTransactions");
    expect(handle).toEqual({ name: "indexFundTransactions" });
  });
});
