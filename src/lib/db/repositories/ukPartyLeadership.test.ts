import { describe, expect, it, vi } from "vitest";
import { ukPartyLeadershipCollection } from "./ukPartyLeadership";
import type { CollectionSource } from "./source";

describe("ukPartyLeadership repository", () => {
  it("opens ukPartyLeadership on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukPartyLeadershipCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukPartyLeadership");
    expect(handle).toEqual({ name: "ukPartyLeadership" });
  });
});
