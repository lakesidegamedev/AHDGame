import { describe, expect, it, vi } from "vitest";
import { senateLeadershipElectionsCollection } from "./senateLeadershipElections";
import type { CollectionSource } from "./source";

describe("senateLeadershipElections repository", () => {
  it("opens senateLeadershipElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = senateLeadershipElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("senateLeadershipElections");
    expect(handle).toEqual({ name: "senateLeadershipElections" });
  });
});
