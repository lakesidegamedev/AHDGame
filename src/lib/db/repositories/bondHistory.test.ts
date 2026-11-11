import { describe, expect, it, vi } from "vitest";
import { bondHistoryCollection } from "./bondHistory";
import type { CollectionSource } from "./source";

describe("bondHistory repository", () => {
  it("opens bondHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bondHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bondHistory");
    expect(handle).toEqual({ name: "bondHistory" });
  });
});
