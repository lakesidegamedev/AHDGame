import { describe, expect, it, vi } from "vitest";
import { federationPrivateFirmHoldsCollection } from "./federationPrivateFirmHolds";
import type { CollectionSource } from "./source";

describe("federationPrivateFirmHolds repository", () => {
  it("opens federationPrivateFirmHolds on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationPrivateFirmHoldsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationPrivateFirmHolds");
    expect(handle).toEqual({ name: "federationPrivateFirmHolds" });
  });
});
