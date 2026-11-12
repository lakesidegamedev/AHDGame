import { describe, expect, it, vi } from "vitest";
import { bondSaleIntentsCollection } from "./bondSaleIntents";
import type { CollectionSource } from "./source";

describe("bondSaleIntents repository", () => {
  it("opens bondSaleIntents on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bondSaleIntentsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bondSaleIntents");
    expect(handle).toEqual({ name: "bondSaleIntents" });
  });
});
