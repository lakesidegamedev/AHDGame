import { describe, expect, it, vi } from "vitest";
import { electoratePriorityOverridesCollection } from "./electoratePriorityOverrides";
import type { CollectionSource } from "./source";

describe("electoratePriorityOverrides repository", () => {
  it("opens electoratePriorityOverrides on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = electoratePriorityOverridesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("electoratePriorityOverrides");
    expect(handle).toEqual({ name: "electoratePriorityOverrides" });
  });
});
