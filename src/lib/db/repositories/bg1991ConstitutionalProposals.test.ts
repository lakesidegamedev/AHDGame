import { describe, expect, it, vi } from "vitest";
import { bg1991ConstitutionalProposalsCollection } from "./bg1991ConstitutionalProposals";
import type { CollectionSource } from "./source";

describe("bg1991ConstitutionalProposals repository", () => {
  it("opens bg1991ConstitutionalProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bg1991ConstitutionalProposalsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bg1991ConstitutionalProposals");
    expect(handle).toEqual({ name: "bg1991ConstitutionalProposals" });
  });
});
