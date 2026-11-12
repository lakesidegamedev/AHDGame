import { describe, expect, it, vi } from "vitest";
import { bargainingRatificationBallotsCollection } from "./bargainingRatificationBallots";
import type { CollectionSource } from "./source";

describe("bargainingRatificationBallots repository", () => {
  it("opens bargainingRatificationBallots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bargainingRatificationBallotsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bargainingRatificationBallots");
    expect(handle).toEqual({ name: "bargainingRatificationBallots" });
  });
});
