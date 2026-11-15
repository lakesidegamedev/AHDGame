import { describe, expect, it, vi } from "vitest";
import { playerIncomeTaxBatchesCollection } from "./playerIncomeTaxBatches";
import type { CollectionSource } from "./source";

describe("playerIncomeTaxBatches repository", () => {
  it("opens playerIncomeTaxBatches on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = playerIncomeTaxBatchesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("playerIncomeTaxBatches");
    expect(handle).toEqual({ name: "playerIncomeTaxBatches" });
  });
});
