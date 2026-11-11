import { describe, expect, it, vi } from "vitest";
import { ngChamberLeadershipElectionsCollection } from "./ngChamberLeadershipElections";
import type { CollectionSource } from "./source";

describe("ngChamberLeadershipElections repository", () => {
  it("opens ngChamberLeadershipElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ngChamberLeadershipElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ngChamberLeadershipElections");
    expect(handle).toEqual({ name: "ngChamberLeadershipElections" });
  });
});
