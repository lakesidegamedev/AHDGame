import { describe, expect, it, vi } from "vitest";
import { nationalCommitteeCandidatesCollection } from "./nationalCommitteeCandidates";
import type { CollectionSource } from "./source";

describe("nationalCommitteeCandidates repository", () => {
  it("opens nationalCommitteeCandidates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalCommitteeCandidatesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalCommitteeCandidates");
    expect(handle).toEqual({ name: "nationalCommitteeCandidates" });
  });
});
