import { describe, expect, it, vi } from "vitest";
import { suggestionReadsCollection } from "./suggestionReads";
import type { CollectionSource } from "./source";

describe("suggestionReads repository", () => {
  it("opens suggestionReads on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = suggestionReadsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("suggestionReads");
    expect(handle).toEqual({ name: "suggestionReads" });
  });
});
