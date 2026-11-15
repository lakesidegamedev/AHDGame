import { describe, expect, it, vi } from "vitest";
import { statePartyElectionsCollection } from "./statePartyElections";
import type { CollectionSource } from "./source";

describe("statePartyElections repository", () => {
  it("opens statePartyElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = statePartyElectionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("statePartyElections");
    expect(handle).toEqual({ name: "statePartyElections" });
  });
});
