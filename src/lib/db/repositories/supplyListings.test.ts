import { describe, expect, it, vi } from "vitest";
import { supplyListingsCollection } from "./supplyListings";
import type { CollectionSource } from "./source";

describe("supplyListings repository", () => {
  it("opens supplyListings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = supplyListingsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("supplyListings");
    expect(handle).toEqual({ name: "supplyListings" });
  });
});
