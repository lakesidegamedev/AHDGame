import { describe, expect, it, vi } from "vitest";
import { caucusChairCandidatesCollection } from "./caucusChairCandidates";
import type { CollectionSource } from "./source";

describe("caucusChairCandidates repository", () => {
  it("opens caucusChairCandidates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = caucusChairCandidatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("caucusChairCandidates");
    expect(handle).toEqual({ name: "caucusChairCandidates" });
  });
});
