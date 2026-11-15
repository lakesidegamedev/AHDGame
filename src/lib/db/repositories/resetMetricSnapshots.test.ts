import { describe, expect, it, vi } from "vitest";
import { resetMetricSnapshotsCollection } from "./resetMetricSnapshots";
import type { CollectionSource } from "./source";

describe("resetMetricSnapshots repository", () => {
  it("opens resetMetricSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetMetricSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetMetricSnapshots");
    expect(handle).toEqual({ name: "resetMetricSnapshots" });
  });
});
