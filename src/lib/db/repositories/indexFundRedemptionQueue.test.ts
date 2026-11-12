import { describe, expect, it, vi } from "vitest";
import { indexFundRedemptionQueueCollection } from "./indexFundRedemptionQueue";
import type { CollectionSource } from "./source";

describe("indexFundRedemptionQueue repository", () => {
  it("opens indexFundRedemptionQueue on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = indexFundRedemptionQueueCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("indexFundRedemptionQueue");
    expect(handle).toEqual({ name: "indexFundRedemptionQueue" });
  });
});
