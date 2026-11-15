import { describe, expect, it, vi } from "vitest";
import { retiredCommodityArchiveCollection } from "./retiredCommodityArchive";
import type { CollectionSource } from "./source";

describe("retiredCommodityArchive repository", () => {
  it("opens retiredCommodityArchive on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = retiredCommodityArchiveCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("retiredCommodityArchive");
    expect(handle).toEqual({ name: "retiredCommodityArchive" });
  });
});
