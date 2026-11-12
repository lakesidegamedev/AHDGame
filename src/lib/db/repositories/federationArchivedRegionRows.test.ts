import { describe, expect, it, vi } from "vitest";
import { federationArchivedRegionRowsCollection } from "./federationArchivedRegionRows";
import type { CollectionSource } from "./source";

describe("federationArchivedRegionRows repository", () => {
  it("opens federationArchivedRegionRows on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationArchivedRegionRowsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationArchivedRegionRows");
    expect(handle).toEqual({ name: "federationArchivedRegionRows" });
  });
});
