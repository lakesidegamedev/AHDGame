import { describe, expect, it, vi } from "vitest";
import { nationalPartyVotesCollection } from "./nationalPartyVotes";
import type { CollectionSource } from "./source";

describe("nationalPartyVotes repository", () => {
  it("opens nationalPartyVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalPartyVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalPartyVotes");
    expect(handle).toEqual({ name: "nationalPartyVotes" });
  });
});
