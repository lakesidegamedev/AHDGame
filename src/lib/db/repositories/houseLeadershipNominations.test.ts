import { describe, expect, it, vi } from "vitest";
import { houseLeadershipNominationsCollection } from "./houseLeadershipNominations";
import type { CollectionSource } from "./source";

describe("houseLeadershipNominations repository", () => {
  it("opens houseLeadershipNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = houseLeadershipNominationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("houseLeadershipNominations");
    expect(handle).toEqual({ name: "houseLeadershipNominations" });
  });
});
