import { describe, expect, it, vi } from "vitest";
import { peaceOffersCollection } from "./peaceOffers";
import type { CollectionSource } from "./source";

describe("peaceOffers repository", () => {
  it("opens peaceOffers on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = peaceOffersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("peaceOffers");
    expect(handle).toEqual({ name: "peaceOffers" });
  });
});
