import { describe, expect, it, vi } from "vitest";
import { nppMarketEntryFunnelsCollection } from "./nppMarketEntryFunnels";
import type { CollectionSource } from "./source";

describe("nppMarketEntryFunnels repository", () => {
  it("opens nppMarketEntryFunnels on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nppMarketEntryFunnelsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nppMarketEntryFunnels");
    expect(handle).toEqual({ name: "nppMarketEntryFunnels" });
  });
});
