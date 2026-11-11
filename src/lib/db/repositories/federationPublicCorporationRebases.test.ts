import { describe, expect, it, vi } from "vitest";
import { federationPublicCorporationRebasesCollection } from "./federationPublicCorporationRebases";
import type { CollectionSource } from "./source";

describe("federationPublicCorporationRebases repository", () => {
  it("opens federationPublicCorporationRebases on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationPublicCorporationRebasesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationPublicCorporationRebases");
    expect(handle).toEqual({ name: "federationPublicCorporationRebases" });
  });
});
