import { describe, expect, it, vi } from "vitest";
import { productAdvertisingAllocationsCollection } from "./productAdvertisingAllocations";
import type { CollectionSource } from "./source";

describe("productAdvertisingAllocations repository", () => {
  it("opens productAdvertisingAllocations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = productAdvertisingAllocationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("productAdvertisingAllocations");
    expect(handle).toEqual({ name: "productAdvertisingAllocations" });
  });
});
