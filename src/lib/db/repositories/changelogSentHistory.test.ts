import { describe, expect, it, vi } from "vitest";
import { changelogSentHistoryCollection } from "./changelogSentHistory";
import type { CollectionSource } from "./source";

describe("changelogSentHistory repository", () => {
  it("opens changelogSentHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = changelogSentHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("changelogSentHistory");
    expect(handle).toEqual({ name: "changelogSentHistory" });
  });
});
