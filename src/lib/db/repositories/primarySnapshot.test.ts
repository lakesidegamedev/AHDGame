import { describe, expect, it, vi } from "vitest";
import { primarySnapshotCollection } from "./primarySnapshot";
import type { CollectionSource } from "./source";

describe("primarySnapshot repository", () => {
  it("opens primarySnapshot on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = primarySnapshotCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("primarySnapshot");
    expect(handle).toEqual({ name: "primarySnapshot" });
  });
});
