import { describe, expect, it, vi } from "vitest";
import { demographicConfigOverridesCollection } from "./demographicConfigOverrides";
import type { CollectionSource } from "./source";

describe("demographicConfigOverrides repository", () => {
  it("opens demographicConfigOverrides on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = demographicConfigOverridesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("demographicConfigOverrides");
    expect(handle).toEqual({ name: "demographicConfigOverrides" });
  });
});
