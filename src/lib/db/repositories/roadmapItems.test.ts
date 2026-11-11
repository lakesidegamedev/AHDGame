import { describe, expect, it, vi } from "vitest";
import { roadmapItemsCollection } from "./roadmapItems";
import type { CollectionSource } from "./source";

describe("roadmapItems repository", () => {
  it("opens roadmapItems on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = roadmapItemsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("roadmapItems");
    expect(handle).toEqual({ name: "roadmapItems" });
  });
});
