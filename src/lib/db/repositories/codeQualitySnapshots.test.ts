import { describe, expect, it, vi } from "vitest";
import { codeQualitySnapshotsCollection } from "./codeQualitySnapshots";
import type { CollectionSource } from "./source";

describe("codeQualitySnapshots repository", () => {
  it("opens codeQualitySnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = codeQualitySnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("codeQualitySnapshots");
    expect(handle).toEqual({ name: "codeQualitySnapshots" });
  });
});
