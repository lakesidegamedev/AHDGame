import { describe, expect, it, vi } from "vitest";
import { corporationCeoVotesCollection } from "./corporationCeoVotes";
import type { CollectionSource } from "./source";

describe("corporationCeoVotes repository", () => {
  it("opens corporationCeoVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationCeoVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporationCeoVotes");
    expect(handle).toEqual({ name: "corporationCeoVotes" });
  });
});
