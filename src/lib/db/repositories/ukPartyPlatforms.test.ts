import { describe, expect, it, vi } from "vitest";
import { ukPartyPlatformsCollection } from "./ukPartyPlatforms";
import type { CollectionSource } from "./source";

describe("ukPartyPlatforms repository", () => {
  it("opens ukPartyPlatforms on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukPartyPlatformsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukPartyPlatforms");
    expect(handle).toEqual({ name: "ukPartyPlatforms" });
  });
});
