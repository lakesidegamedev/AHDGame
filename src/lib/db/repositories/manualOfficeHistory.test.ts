import { describe, expect, it, vi } from "vitest";
import { manualOfficeHistoryCollection } from "./manualOfficeHistory";
import type { CollectionSource } from "./source";

describe("manualOfficeHistory repository", () => {
  it("opens manualOfficeHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = manualOfficeHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("manualOfficeHistory");
    expect(handle).toEqual({ name: "manualOfficeHistory" });
  });
});
