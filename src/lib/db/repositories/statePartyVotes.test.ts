import { describe, expect, it, vi } from "vitest";
import { statePartyVotesCollection } from "./statePartyVotes";
import type { CollectionSource } from "./source";

describe("statePartyVotes repository", () => {
  it("opens statePartyVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = statePartyVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("statePartyVotes");
    expect(handle).toEqual({ name: "statePartyVotes" });
  });
});
