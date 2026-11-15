import { describe, expect, it, vi } from "vitest";
import { bondMarketPoolsCollection } from "./bondMarketPools";
import type { CollectionSource } from "./source";

describe("bondMarketPools repository", () => {
  it("opens bondMarketPools on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bondMarketPoolsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bondMarketPools");
    expect(handle).toEqual({ name: "bondMarketPools" });
  });
});
