import { describe, expect, it, vi } from "vitest";
import { unifiedSessionsCollection } from "./unifiedSessions";
import type { CollectionSource } from "./source";

describe("unifiedSessions repository", () => {
  it("opens unifiedSessions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = unifiedSessionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("unifiedSessions");
    expect(handle).toEqual({ name: "unifiedSessions" });
  });
});
