import { describe, expect, it, vi } from "vitest";
import { suggestionCommentsCollection } from "./suggestionComments";
import type { CollectionSource } from "./source";

describe("suggestionComments repository", () => {
  it("opens suggestionComments on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = suggestionCommentsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("suggestionComments");
    expect(handle).toEqual({ name: "suggestionComments" });
  });
});
