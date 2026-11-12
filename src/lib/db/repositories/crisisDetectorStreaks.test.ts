import { describe, expect, it, vi } from "vitest";
import { crisisDetectorStreaksCollection } from "./crisisDetectorStreaks";
import type { CollectionSource } from "./source";

describe("crisisDetectorStreaks repository", () => {
  it("opens crisisDetectorStreaks on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = crisisDetectorStreaksCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("crisisDetectorStreaks");
    expect(handle).toEqual({ name: "crisisDetectorStreaks" });
  });
});
