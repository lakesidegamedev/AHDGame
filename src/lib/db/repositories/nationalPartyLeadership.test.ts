import { describe, expect, it, vi } from "vitest";
import { nationalPartyLeadershipCollection } from "./nationalPartyLeadership";
import type { CollectionSource } from "./source";

describe("nationalPartyLeadership repository", () => {
  it("opens nationalPartyLeadership on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalPartyLeadershipCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalPartyLeadership");
    expect(handle).toEqual({ name: "nationalPartyLeadership" });
  });
});
