import { describe, expect, it, vi } from "vitest";
import { patreonReconcileUnmatchedCollection } from "./patreonReconcileUnmatched";
import type { CollectionSource } from "./source";

describe("patreonReconcileUnmatched repository", () => {
  it("opens patreonReconcileUnmatched on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = patreonReconcileUnmatchedCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("patreonReconcileUnmatched");
    expect(handle).toEqual({ name: "patreonReconcileUnmatched" });
  });
});
