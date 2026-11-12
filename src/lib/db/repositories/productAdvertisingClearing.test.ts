import { describe, expect, it, vi } from "vitest";
import { productAdvertisingClearingCollection } from "./productAdvertisingClearing";
import type { CollectionSource } from "./source";

describe("productAdvertisingClearing repository", () => {
  it("opens productAdvertisingClearing on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = productAdvertisingClearingCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("productAdvertisingClearing");
    expect(handle).toEqual({ name: "productAdvertisingClearing" });
  });
});
