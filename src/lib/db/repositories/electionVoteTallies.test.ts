import { describe, expect, it, vi } from "vitest";
import { electionVoteTalliesCollection } from "./electionVoteTallies";
import type { CollectionSource } from "./source";

describe("electionVoteTallies repository", () => {
  it("opens electionVoteTallies on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = electionVoteTalliesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("electionVoteTallies");
    expect(handle).toEqual({ name: "electionVoteTallies" });
  });
});
