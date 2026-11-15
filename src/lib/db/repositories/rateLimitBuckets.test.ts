import { describe, expect, it, vi } from "vitest";
import { rateLimitBucketsCollection } from "./rateLimitBuckets";
import type { CollectionSource } from "./source";

describe("rateLimitBuckets repository", () => {
  it("opens rateLimitBuckets on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = rateLimitBucketsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("rateLimitBuckets");
    expect(handle).toEqual({ name: "rateLimitBuckets" });
  });
});
