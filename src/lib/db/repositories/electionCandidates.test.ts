import { describe, expect, it, vi } from "vitest";
import { electionCandidatesCollection } from "./electionCandidates";
import type { CollectionSource } from "./source";

describe("electionCandidates repository", () => {
  it("opens electionCandidates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = electionCandidatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("electionCandidates");
    expect(handle).toEqual({ name: "electionCandidates" });
  });
});
