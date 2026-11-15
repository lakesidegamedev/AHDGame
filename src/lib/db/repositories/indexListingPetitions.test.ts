import { describe, expect, it, vi } from "vitest";
import { indexListingPetitionsCollection } from "./indexListingPetitions";
import type { CollectionSource } from "./source";

describe("indexListingPetitions repository", () => {
  it("opens indexListingPetitions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = indexListingPetitionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("indexListingPetitions");
    expect(handle).toEqual({ name: "indexListingPetitions" });
  });
});
