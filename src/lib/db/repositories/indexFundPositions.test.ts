import { describe, expect, it, vi } from "vitest";
import { indexFundPositionsCollection } from "./indexFundPositions";
import type { CollectionSource } from "./source";

describe("indexFundPositions repository", () => {
  it("opens indexFundPositions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = indexFundPositionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("indexFundPositions");
    expect(handle).toEqual({ name: "indexFundPositions" });
  });
});
