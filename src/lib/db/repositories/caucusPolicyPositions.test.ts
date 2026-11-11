import { describe, expect, it, vi } from "vitest";
import { caucusPolicyPositionsCollection } from "./caucusPolicyPositions";
import type { CollectionSource } from "./source";

describe("caucusPolicyPositions repository", () => {
  it("opens caucusPolicyPositions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = caucusPolicyPositionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("caucusPolicyPositions");
    expect(handle).toEqual({ name: "caucusPolicyPositions" });
  });
});
