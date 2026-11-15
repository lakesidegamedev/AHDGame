import { describe, expect, it, vi } from "vitest";
import { federationArchivedPoliticalRowsCollection } from "./federationArchivedPoliticalRows";
import type { CollectionSource } from "./source";

describe("federationArchivedPoliticalRows repository", () => {
  it("opens federationArchivedPoliticalRows on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationArchivedPoliticalRowsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationArchivedPoliticalRows");
    expect(handle).toEqual({ name: "federationArchivedPoliticalRows" });
  });
});
