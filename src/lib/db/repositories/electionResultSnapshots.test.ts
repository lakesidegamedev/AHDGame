import { describe, expect, it, vi } from "vitest";
import { electionResultSnapshotsCollection } from "./electionResultSnapshots";
import type { CollectionSource } from "./source";

describe("electionResultSnapshots repository", () => {
  it("opens electionResultSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = electionResultSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("electionResultSnapshots");
    expect(handle).toEqual({ name: "electionResultSnapshots" });
  });
});
