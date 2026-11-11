import { describe, expect, it, vi } from "vitest";
import { federationFacilityPaymentTurnsCollection } from "./federationFacilityPaymentTurns";
import type { CollectionSource } from "./source";

describe("federationFacilityPaymentTurns repository", () => {
  it("opens federationFacilityPaymentTurns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationFacilityPaymentTurnsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationFacilityPaymentTurns");
    expect(handle).toEqual({ name: "federationFacilityPaymentTurns" });
  });
});
