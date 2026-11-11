import { describe, expect, it, vi } from "vitest";
import { federationRelocationsCollection } from "./federationRelocations";
import type { CollectionSource } from "./source";

describe("federationRelocations repository", () => {
  it("opens federationRelocations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationRelocationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationRelocations");
    expect(handle).toEqual({ name: "federationRelocations" });
  });
});
