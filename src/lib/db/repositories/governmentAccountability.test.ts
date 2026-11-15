import { describe, expect, it, vi } from "vitest";
import { governmentAccountabilityCollection } from "./governmentAccountability";
import type { CollectionSource } from "./source";

describe("governmentAccountability repository", () => {
  it("opens governmentAccountability on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governmentAccountabilityCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governmentAccountability");
    expect(handle).toEqual({ name: "governmentAccountability" });
  });
});
