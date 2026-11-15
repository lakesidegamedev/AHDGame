import { describe, expect, it, vi } from "vitest";
import { nationalizationAuctionsCollection } from "./nationalizationAuctions";
import type { CollectionSource } from "./source";

describe("nationalizationAuctions repository", () => {
  it("opens nationalizationAuctions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalizationAuctionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalizationAuctions");
    expect(handle).toEqual({ name: "nationalizationAuctions" });
  });
});
