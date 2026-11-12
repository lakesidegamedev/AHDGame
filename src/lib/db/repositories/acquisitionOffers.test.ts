import { describe, expect, it, vi } from "vitest";
import { acquisitionOffersCollection } from "./acquisitionOffers";
import type { CollectionSource } from "./source";

describe("acquisitionOffers repository", () => {
  it("opens acquisitionOffers on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = acquisitionOffersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("acquisitionOffers");
    expect(handle).toEqual({ name: "acquisitionOffers" });
  });
});
