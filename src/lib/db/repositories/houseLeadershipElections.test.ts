import { describe, expect, it, vi } from "vitest";
import { houseLeadershipElectionsCollection } from "./houseLeadershipElections";
import type { CollectionSource } from "./source";

describe("houseLeadershipElections repository", () => {
  it("opens houseLeadershipElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = houseLeadershipElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("houseLeadershipElections");
    expect(handle).toEqual({ name: "houseLeadershipElections" });
  });
});
