import { describe, expect, it, vi } from "vitest";
import { partyDiscussionPostsCollection } from "./partyDiscussionPosts";
import type { CollectionSource } from "./source";

describe("partyDiscussionPosts repository", () => {
  it("opens partyDiscussionPosts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyDiscussionPostsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyDiscussionPosts");
    expect(handle).toEqual({ name: "partyDiscussionPosts" });
  });
});
