import { describe, expect, it, vi } from "vitest";
import { corporationPortfolioHistoryCollection } from "./corporationPortfolioHistory";
import type { CollectionSource } from "./source";

describe("corporationPortfolioHistory repository", () => {
  it("opens corporationPortfolioHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationPortfolioHistoryCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporationPortfolioHistory");
    expect(handle).toEqual({ name: "corporationPortfolioHistory" });
  });
});
