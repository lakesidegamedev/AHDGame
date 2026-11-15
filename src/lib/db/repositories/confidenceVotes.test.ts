import { describe, expect, it, vi } from "vitest";
import { confidenceVotesCollection } from "./confidenceVotes";
import type { CollectionSource } from "./source";

describe("confidenceVotes repository", () => {
  it("opens confidenceVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = confidenceVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("confidenceVotes");
    expect(handle).toEqual({ name: "confidenceVotes" });
  });
});
