import { describe, expect, it, vi } from "vitest";
import { federationPreparedEffectsCollection } from "./federationPreparedEffects";
import type { CollectionSource } from "./source";

describe("federationPreparedEffects repository", () => {
  it("opens federationPreparedEffects on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationPreparedEffectsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationPreparedEffects");
    expect(handle).toEqual({ name: "federationPreparedEffects" });
  });
});
