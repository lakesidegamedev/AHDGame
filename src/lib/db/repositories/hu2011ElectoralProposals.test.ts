import { describe, expect, it, vi } from "vitest";
import { hu2011ElectoralProposalsCollection } from "./hu2011ElectoralProposals";
import type { CollectionSource } from "./source";

describe("hu2011ElectoralProposals repository", () => {
  it("opens hu2011ElectoralProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu2011ElectoralProposalsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu2011ElectoralProposals");
    expect(handle).toEqual({ name: "hu2011ElectoralProposals" });
  });
});
