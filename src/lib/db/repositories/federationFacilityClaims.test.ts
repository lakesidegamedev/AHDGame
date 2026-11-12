import { describe, expect, it, vi } from "vitest";
import { federationFacilityClaimsCollection } from "./federationFacilityClaims";
import type { CollectionSource } from "./source";

describe("federationFacilityClaims repository", () => {
  it("opens federationFacilityClaims on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationFacilityClaimsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationFacilityClaims");
    expect(handle).toEqual({ name: "federationFacilityClaims" });
  });
});
