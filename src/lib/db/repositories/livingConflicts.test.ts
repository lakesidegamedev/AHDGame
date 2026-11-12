import { describe, expect, it, vi } from "vitest";
import { livingConflictsCollection } from "./livingConflicts";
import type { CollectionSource } from "./source";

describe("livingConflicts repository", () => {
  it("opens livingConflicts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = livingConflictsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("livingConflicts");
    expect(handle).toEqual({ name: "livingConflicts" });
  });
});
