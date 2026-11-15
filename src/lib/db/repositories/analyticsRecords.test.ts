import { describe, expect, it, vi } from "vitest";
import { analyticsRecordsCollection } from "./analyticsRecords";
import type { CollectionSource } from "./source";

describe("analyticsRecords repository", () => {
  it("opens analyticsRecords on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = analyticsRecordsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("analyticsRecords");
    expect(handle).toEqual({ name: "analyticsRecords" });
  });
});
