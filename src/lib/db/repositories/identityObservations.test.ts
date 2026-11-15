import { describe, expect, it, vi } from "vitest";
import { identityObservationsCollection } from "./identityObservations";
import type { CollectionSource } from "./source";

describe("identityObservations repository", () => {
  it("opens identityObservations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = identityObservationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("identityObservations");
    expect(handle).toEqual({ name: "identityObservations" });
  });
});
