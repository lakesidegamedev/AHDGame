import { describe, expect, it, vi } from "vitest";
import { productAdvertisingPayablesCollection } from "./productAdvertisingPayables";
import type { CollectionSource } from "./source";

describe("productAdvertisingPayables repository", () => {
  it("opens productAdvertisingPayables on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = productAdvertisingPayablesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("productAdvertisingPayables");
    expect(handle).toEqual({ name: "productAdvertisingPayables" });
  });
});
