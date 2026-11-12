import { describe, expect, it, vi } from "vitest";
import { demographicDefaultsCollection } from "./demographicDefaults";
import type { CollectionSource } from "./source";

describe("demographicDefaults repository", () => {
  it("opens demographicDefaults on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = demographicDefaultsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("demographicDefaults");
    expect(handle).toEqual({ name: "demographicDefaults" });
  });
});
