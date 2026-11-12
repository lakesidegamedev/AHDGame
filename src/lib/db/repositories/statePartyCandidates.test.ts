import { describe, expect, it, vi } from "vitest";
import { statePartyCandidatesCollection } from "./statePartyCandidates";
import type { CollectionSource } from "./source";

describe("statePartyCandidates repository", () => {
  it("opens statePartyCandidates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = statePartyCandidatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("statePartyCandidates");
    expect(handle).toEqual({ name: "statePartyCandidates" });
  });
});
