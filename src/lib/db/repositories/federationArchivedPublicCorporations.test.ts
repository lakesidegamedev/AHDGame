import { describe, expect, it, vi } from "vitest";
import { federationArchivedPublicCorporationsCollection } from "./federationArchivedPublicCorporations";
import type { CollectionSource } from "./source";

describe("federationArchivedPublicCorporations repository", () => {
  it("opens federationArchivedPublicCorporations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationArchivedPublicCorporationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationArchivedPublicCorporations");
    expect(handle).toEqual({ name: "federationArchivedPublicCorporations" });
  });
});
