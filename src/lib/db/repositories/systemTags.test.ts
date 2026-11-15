import { describe, expect, it, vi } from "vitest";
import { systemTagsCollection } from "./systemTags";
import type { CollectionSource } from "./source";

describe("systemTags repository", () => {
  it("opens systemTags on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = systemTagsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("systemTags");
    expect(handle).toEqual({ name: "systemTags" });
  });
});
