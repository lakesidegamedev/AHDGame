import { describe, expect, it, vi } from "vitest";
import { federationLegacyServiceTurnsCollection } from "./federationLegacyServiceTurns";
import type { CollectionSource } from "./source";

describe("federationLegacyServiceTurns repository", () => {
  it("opens federationLegacyServiceTurns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationLegacyServiceTurnsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationLegacyServiceTurns");
    expect(handle).toEqual({ name: "federationLegacyServiceTurns" });
  });
});
