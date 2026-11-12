import { describe, expect, it, vi } from "vitest";
import { shareListingsCollection } from "./shareListings";
import type { CollectionSource } from "./source";

describe("shareListings repository", () => {
  it("opens shareListings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = shareListingsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("shareListings");
    expect(handle).toEqual({ name: "shareListings" });
  });
});
