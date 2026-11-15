import { describe, expect, it, vi } from "vitest";
import { stateDemographicsCollection } from "./stateDemographics";
import type { CollectionSource } from "./source";

describe("stateDemographics repository", () => {
  it("opens stateDemographics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateDemographicsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateDemographics");
    expect(handle).toEqual({ name: "stateDemographics" });
  });
});
