import { describe, expect, it, vi } from "vitest";
import { equityMarketPoolsCollection } from "./equityMarketPools";
import type { CollectionSource } from "./source";

describe("equityMarketPools repository", () => {
  it("opens equityMarketPools on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = equityMarketPoolsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("equityMarketPools");
    expect(handle).toEqual({ name: "equityMarketPools" });
  });
});
