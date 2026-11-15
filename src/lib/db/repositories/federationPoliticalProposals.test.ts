import { describe, expect, it, vi } from "vitest";
import { federationPoliticalProposalsCollection } from "./federationPoliticalProposals";
import type { CollectionSource } from "./source";

describe("federationPoliticalProposals repository", () => {
  it("opens federationPoliticalProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationPoliticalProposalsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationPoliticalProposals");
    expect(handle).toEqual({ name: "federationPoliticalProposals" });
  });
});
