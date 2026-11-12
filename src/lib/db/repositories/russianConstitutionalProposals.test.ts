import { describe, expect, it, vi } from "vitest";
import { russianConstitutionalProposalsCollection } from "./russianConstitutionalProposals";
import type { CollectionSource } from "./source";

describe("russianConstitutionalProposals repository", () => {
  it("opens russianConstitutionalProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianConstitutionalProposalsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianConstitutionalProposals");
    expect(handle).toEqual({ name: "russianConstitutionalProposals" });
  });
});
