import { describe, expect, it, vi } from "vitest";
import { governmentFormationVotesCollection } from "./governmentFormationVotes";
import type { CollectionSource } from "./source";

describe("governmentFormationVotes repository", () => {
  it("opens governmentFormationVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governmentFormationVotesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governmentFormationVotes");
    expect(handle).toEqual({ name: "governmentFormationVotes" });
  });
});
