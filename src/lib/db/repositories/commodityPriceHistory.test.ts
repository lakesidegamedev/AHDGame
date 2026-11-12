import { describe, expect, it, vi } from "vitest";
import { commodityPriceHistoryCollection } from "./commodityPriceHistory";
import type { CollectionSource } from "./source";

describe("commodityPriceHistory repository", () => {
  it("opens commodityPriceHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = commodityPriceHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("commodityPriceHistory");
    expect(handle).toEqual({ name: "commodityPriceHistory" });
  });
});
