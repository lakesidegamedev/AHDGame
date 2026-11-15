import { describe, expect, it, vi } from "vitest";
import { commodityQualityCollection } from "./commodityQuality";
import type { CollectionSource } from "./source";

describe("commodityQuality repository", () => {
  it("opens commodityQuality on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = commodityQualityCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("commodityQuality");
    expect(handle).toEqual({ name: "commodityQuality" });
  });
});
