import { describe, expect, it, vi } from "vitest";
import { organizationMembershipProposalsCollection } from "./organizationMembershipProposals";
import type { CollectionSource } from "./source";

describe("organizationMembershipProposals repository", () => {
  it("opens organizationMembershipProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = organizationMembershipProposalsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("organizationMembershipProposals");
    expect(handle).toEqual({ name: "organizationMembershipProposals" });
  });
});
