import { describe, expect, it, vi } from "vitest";
import { hu1994ElectoralProposalsCollection } from "./hu1994ElectoralProposals";
import type { CollectionSource } from "./source";

describe("hu1994ElectoralProposals repository", () => {
  it("opens hu1994ElectoralProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu1994ElectoralProposalsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu1994ElectoralProposals");
    expect(handle).toEqual({ name: "hu1994ElectoralProposals" });
  });
});
