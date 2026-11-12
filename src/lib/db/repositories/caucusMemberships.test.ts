import { describe, expect, it, vi } from "vitest";
import { caucusMembershipsCollection } from "./caucusMemberships";
import type { CollectionSource } from "./source";

describe("caucusMemberships repository", () => {
  it("opens caucusMemberships on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = caucusMembershipsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("caucusMemberships");
    expect(handle).toEqual({ name: "caucusMemberships" });
  });
});
