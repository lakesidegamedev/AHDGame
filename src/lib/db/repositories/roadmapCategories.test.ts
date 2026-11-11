import { describe, expect, it, vi } from "vitest";
import { roadmapCategoriesCollection } from "./roadmapCategories";
import type { CollectionSource } from "./source";

describe("roadmapCategories repository", () => {
  it("opens roadmapCategories on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = roadmapCategoriesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("roadmapCategories");
    expect(handle).toEqual({ name: "roadmapCategories" });
  });
});
