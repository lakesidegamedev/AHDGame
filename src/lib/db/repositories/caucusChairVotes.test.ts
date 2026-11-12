import { describe, expect, it, vi } from "vitest";
import { caucusChairVotesCollection } from "./caucusChairVotes";
import type { CollectionSource } from "./source";

describe("caucusChairVotes repository", () => {
  it("opens caucusChairVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = caucusChairVotesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("caucusChairVotes");
    expect(handle).toEqual({ name: "caucusChairVotes" });
  });
});
