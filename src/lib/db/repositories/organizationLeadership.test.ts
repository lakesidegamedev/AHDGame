import { describe, expect, it, vi } from "vitest";
import { organizationLeadershipCollection } from "./organizationLeadership";
import type { CollectionSource } from "./source";

describe("organizationLeadership repository", () => {
  it("opens organizationLeadership on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = organizationLeadershipCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("organizationLeadership");
    expect(handle).toEqual({ name: "organizationLeadership" });
  });
});
