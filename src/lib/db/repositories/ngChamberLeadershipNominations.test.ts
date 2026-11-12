import { describe, expect, it, vi } from "vitest";
import { ngChamberLeadershipNominationsCollection } from "./ngChamberLeadershipNominations";
import type { CollectionSource } from "./source";

describe("ngChamberLeadershipNominations repository", () => {
  it("opens ngChamberLeadershipNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ngChamberLeadershipNominationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ngChamberLeadershipNominations");
    expect(handle).toEqual({ name: "ngChamberLeadershipNominations" });
  });
});
