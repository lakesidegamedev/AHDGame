import { describe, expect, it, vi } from "vitest";
import { noConfidenceVotesCollection } from "./noConfidenceVotes";
import type { CollectionSource } from "./source";

describe("noConfidenceVotes repository", () => {
  it("opens noConfidenceVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = noConfidenceVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("noConfidenceVotes");
    expect(handle).toEqual({ name: "noConfidenceVotes" });
  });
});
