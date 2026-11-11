import { describe, expect, it, vi } from "vitest";
import { nppVotePredictionsCollection } from "./nppVotePredictions";
import type { CollectionSource } from "./source";

describe("nppVotePredictions repository", () => {
  it("opens nppVotePredictions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nppVotePredictionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nppVotePredictions");
    expect(handle).toEqual({ name: "nppVotePredictions" });
  });
});
