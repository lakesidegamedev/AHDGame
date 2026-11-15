import { describe, expect, it, vi } from "vitest";
import { officeHistoryArchiveCollection } from "./officeHistoryArchive";
import type { CollectionSource } from "./source";

describe("officeHistoryArchive repository", () => {
  it("opens officeHistoryArchive on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = officeHistoryArchiveCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("officeHistoryArchive");
    expect(handle).toEqual({ name: "officeHistoryArchive" });
  });
});
