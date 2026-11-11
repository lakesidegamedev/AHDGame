import { describe, expect, it, vi } from "vitest";
import { slateCandidatesCollection } from "./slateCandidates";
import type { CollectionSource } from "./source";

describe("slateCandidates repository", () => {
  it("opens slateCandidates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = slateCandidatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("slateCandidates");
    expect(handle).toEqual({ name: "slateCandidates" });
  });
});
