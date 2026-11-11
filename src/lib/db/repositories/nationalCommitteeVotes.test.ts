import { describe, expect, it, vi } from "vitest";
import { nationalCommitteeVotesCollection } from "./nationalCommitteeVotes";
import type { CollectionSource } from "./source";

describe("nationalCommitteeVotes repository", () => {
  it("opens nationalCommitteeVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalCommitteeVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalCommitteeVotes");
    expect(handle).toEqual({ name: "nationalCommitteeVotes" });
  });
});
