import { describe, expect, it, vi } from "vitest";
import { billDiscussionsCollection } from "./billDiscussions";
import type { CollectionSource } from "./source";

describe("billDiscussions repository", () => {
  it("opens billDiscussions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = billDiscussionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("billDiscussions");
    expect(handle).toEqual({ name: "billDiscussions" });
  });
});
