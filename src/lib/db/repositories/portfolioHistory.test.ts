import { describe, expect, it, vi } from "vitest";
import { portfolioHistoryCollection } from "./portfolioHistory";
import type { CollectionSource } from "./source";

describe("portfolioHistory repository", () => {
  it("opens portfolioHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = portfolioHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("portfolioHistory");
    expect(handle).toEqual({ name: "portfolioHistory" });
  });
});
