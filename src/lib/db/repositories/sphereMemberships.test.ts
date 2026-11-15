import { describe, expect, it, vi } from "vitest";
import { sphereMembershipsCollection } from "./sphereMemberships";
import type { CollectionSource } from "./source";

describe("sphereMemberships repository", () => {
  it("opens sphereMemberships on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sphereMembershipsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sphereMemberships");
    expect(handle).toEqual({ name: "sphereMemberships" });
  });
});
