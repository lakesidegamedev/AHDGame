import { describe, expect, it, vi } from "vitest";
import { organizationMembershipsCollection } from "./organizationMemberships";
import type { CollectionSource } from "./source";

describe("organizationMemberships repository", () => {
  it("opens organizationMemberships on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = organizationMembershipsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("organizationMemberships");
    expect(handle).toEqual({ name: "organizationMemberships" });
  });
});
