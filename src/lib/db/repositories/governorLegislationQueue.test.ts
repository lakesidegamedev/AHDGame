import { describe, expect, it, vi } from "vitest";
import { governorLegislationQueueCollection } from "./governorLegislationQueue";
import type { CollectionSource } from "./source";

describe("governorLegislationQueue repository", () => {
  it("opens governorLegislationQueue on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governorLegislationQueueCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governorLegislationQueue");
    expect(handle).toEqual({ name: "governorLegislationQueue" });
  });
});
