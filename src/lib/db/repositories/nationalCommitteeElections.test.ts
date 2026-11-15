import { describe, expect, it, vi } from "vitest";
import { nationalCommitteeElectionsCollection } from "./nationalCommitteeElections";
import type { CollectionSource } from "./source";

describe("nationalCommitteeElections repository", () => {
  it("opens nationalCommitteeElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalCommitteeElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalCommitteeElections");
    expect(handle).toEqual({ name: "nationalCommitteeElections" });
  });
});
