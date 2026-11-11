import { describe, expect, it, vi } from "vitest";
import { corporationVotesCollection } from "./corporationVotes";
import type { CollectionSource } from "./source";

describe("corporationVotes repository", () => {
  it("opens corporationVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporationVotes");
    expect(handle).toEqual({ name: "corporationVotes" });
  });
});
