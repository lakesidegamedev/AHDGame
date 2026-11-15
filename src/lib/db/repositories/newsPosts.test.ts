import { describe, expect, it, vi } from "vitest";
import { newsPostsCollection } from "./newsPosts";
import type { CollectionSource } from "./source";

describe("newsPosts repository", () => {
  it("opens newsPosts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = newsPostsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("newsPosts");
    expect(handle).toEqual({ name: "newsPosts" });
  });
});
