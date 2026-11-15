import { describe, expect, it, vi } from "vitest";
import { regionDemographicsCollection } from "./regionDemographics";
import type { CollectionSource } from "./source";

describe("regionDemographics repository", () => {
  it("opens regionDemographics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = regionDemographicsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("regionDemographics");
    expect(handle).toEqual({ name: "regionDemographics" });
  });
});
