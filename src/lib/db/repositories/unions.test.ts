import { describe, expect, it, vi } from "vitest";
import { unionsCollection } from "./unions";
import type { CollectionSource } from "./source";

describe("unions repository", () => {
  it("opens unions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = unionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("unions");
    expect(handle).toEqual({ name: "unions" });
  });
});
