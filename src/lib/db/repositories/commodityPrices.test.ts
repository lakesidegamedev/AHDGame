import { describe, expect, it, vi } from "vitest";
import { commodityPricesCollection } from "./commodityPrices";
import type { CollectionSource } from "./source";

describe("commodityPrices repository", () => {
  it("opens commodityPrices on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = commodityPricesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("commodityPrices");
    expect(handle).toEqual({ name: "commodityPrices" });
  });
});
