import { describe, expect, it, vi } from "vitest";
import { organizationLeadershipElectionsCollection } from "./organizationLeadershipElections";
import type { CollectionSource } from "./source";

describe("organizationLeadershipElections repository", () => {
  it("opens organizationLeadershipElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = organizationLeadershipElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("organizationLeadershipElections");
    expect(handle).toEqual({ name: "organizationLeadershipElections" });
  });
});
