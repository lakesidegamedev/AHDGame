import { describe, expect, it, vi } from "vitest";
import { nationalPartyElectionsCollection } from "./nationalPartyElections";
import type { CollectionSource } from "./source";

describe("nationalPartyElections repository", () => {
  it("opens nationalPartyElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalPartyElectionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalPartyElections");
    expect(handle).toEqual({ name: "nationalPartyElections" });
  });
});
