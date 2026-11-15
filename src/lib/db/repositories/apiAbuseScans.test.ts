import { describe, expect, it, vi } from "vitest";
import { apiAbuseScansCollection } from "./apiAbuseScans";
import type { CollectionSource } from "./source";

describe("apiAbuseScans repository", () => {
  it("opens apiAbuseScans on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = apiAbuseScansCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("apiAbuseScans");
    expect(handle).toEqual({ name: "apiAbuseScans" });
  });
});
