import { describe, expect, it, vi } from "vitest";
import { ro1992ElectoralProposalsCollection } from "./ro1992ElectoralProposals";
import type { CollectionSource } from "./source";

describe("ro1992ElectoralProposals repository", () => {
  it("opens ro1992ElectoralProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ro1992ElectoralProposalsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ro1992ElectoralProposals");
    expect(handle).toEqual({ name: "ro1992ElectoralProposals" });
  });
});
