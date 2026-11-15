import { describe, expect, it, vi } from "vitest";
import { influenceHistoryCollection } from "./influenceHistory";
import type { CollectionSource } from "./source";

describe("influenceHistory repository", () => {
  it("opens influenceHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = influenceHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("influenceHistory");
    expect(handle).toEqual({ name: "influenceHistory" });
  });
});
