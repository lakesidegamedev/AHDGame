import { describe, expect, it, vi } from "vitest";
import { federationContinuingServiceTurnsCollection } from "./federationContinuingServiceTurns";
import type { CollectionSource } from "./source";

describe("federationContinuingServiceTurns repository", () => {
  it("opens federationContinuingServiceTurns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationContinuingServiceTurnsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationContinuingServiceTurns");
    expect(handle).toEqual({ name: "federationContinuingServiceTurns" });
  });
});
