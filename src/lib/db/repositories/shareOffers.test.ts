import { describe, expect, it, vi } from "vitest";
import { shareOffersCollection } from "./shareOffers";
import type { CollectionSource } from "./source";

describe("shareOffers repository", () => {
  it("opens shareOffers on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = shareOffersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("shareOffers");
    expect(handle).toEqual({ name: "shareOffers" });
  });
});
