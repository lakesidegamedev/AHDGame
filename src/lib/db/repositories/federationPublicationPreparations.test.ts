import { describe, expect, it, vi } from "vitest";
import { federationPublicationPreparationsCollection } from "./federationPublicationPreparations";
import type { CollectionSource } from "./source";

describe("federationPublicationPreparations repository", () => {
  it("opens federationPublicationPreparations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationPublicationPreparationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationPublicationPreparations");
    expect(handle).toEqual({ name: "federationPublicationPreparations" });
  });
});
