import { describe, expect, it, vi } from "vitest";
import { nationalPartyCandidatesCollection } from "./nationalPartyCandidates";
import type { CollectionSource } from "./source";

describe("nationalPartyCandidates repository", () => {
  it("opens nationalPartyCandidates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalPartyCandidatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalPartyCandidates");
    expect(handle).toEqual({ name: "nationalPartyCandidates" });
  });
});
