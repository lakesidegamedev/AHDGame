import { describe, expect, it, vi } from "vitest";
import { federationResidentHoldsCollection } from "./federationResidentHolds";
import type { CollectionSource } from "./source";

describe("federationResidentHolds repository", () => {
  it("opens federationResidentHolds on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationResidentHoldsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationResidentHolds");
    expect(handle).toEqual({ name: "federationResidentHolds" });
  });
});
