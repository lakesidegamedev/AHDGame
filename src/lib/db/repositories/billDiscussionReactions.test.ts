import { describe, expect, it, vi } from "vitest";
import { billDiscussionReactionsCollection } from "./billDiscussionReactions";
import type { CollectionSource } from "./source";

describe("billDiscussionReactions repository", () => {
  it("opens billDiscussionReactions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = billDiscussionReactionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("billDiscussionReactions");
    expect(handle).toEqual({ name: "billDiscussionReactions" });
  });
});
