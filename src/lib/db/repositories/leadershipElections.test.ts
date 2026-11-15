import { describe, expect, it, vi } from "vitest";
import { leadershipElectionsCollection } from "./leadershipElections";
import type { CollectionSource } from "./source";

describe("leadershipElections repository", () => {
  it("opens leadershipElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = leadershipElectionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("leadershipElections");
    expect(handle).toEqual({ name: "leadershipElections" });
  });
});
