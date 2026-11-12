import { describe, expect, it, vi } from "vitest";
import { committeeProposalsCollection } from "./committeeProposals";
import type { CollectionSource } from "./source";

describe("committeeProposals repository", () => {
  it("opens committeeProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = committeeProposalsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("committeeProposals");
    expect(handle).toEqual({ name: "committeeProposals" });
  });
});
