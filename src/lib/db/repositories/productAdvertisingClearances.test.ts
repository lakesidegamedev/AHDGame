import { describe, expect, it, vi } from "vitest";
import { productAdvertisingClearancesCollection } from "./productAdvertisingClearances";
import type { CollectionSource } from "./source";

describe("productAdvertisingClearances repository", () => {
  it("opens productAdvertisingClearances on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = productAdvertisingClearancesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("productAdvertisingClearances");
    expect(handle).toEqual({ name: "productAdvertisingClearances" });
  });
});
