import { describe, expect, it, vi } from "vitest";
import { senateLeadershipNominationsCollection } from "./senateLeadershipNominations";
import type { CollectionSource } from "./source";

describe("senateLeadershipNominations repository", () => {
  it("opens senateLeadershipNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = senateLeadershipNominationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("senateLeadershipNominations");
    expect(handle).toEqual({ name: "senateLeadershipNominations" });
  });
});
