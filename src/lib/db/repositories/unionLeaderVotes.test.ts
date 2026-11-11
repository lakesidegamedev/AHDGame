import { describe, expect, it, vi } from "vitest";
import { unionLeaderVotesCollection } from "./unionLeaderVotes";
import type { CollectionSource } from "./source";

describe("unionLeaderVotes repository", () => {
  it("opens unionLeaderVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = unionLeaderVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("unionLeaderVotes");
    expect(handle).toEqual({ name: "unionLeaderVotes" });
  });
});
