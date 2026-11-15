import { describe, expect, it, vi } from "vitest";
import { nonAtomicMoneyFlowReceiptsCollection } from "./nonAtomicMoneyFlowReceipts";
import type { CollectionSource } from "./source";

describe("nonAtomicMoneyFlowReceipts repository", () => {
  it("opens nonAtomicMoneyFlowReceipts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nonAtomicMoneyFlowReceiptsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nonAtomicMoneyFlowReceipts");
    expect(handle).toEqual({ name: "nonAtomicMoneyFlowReceipts" });
  });
});
