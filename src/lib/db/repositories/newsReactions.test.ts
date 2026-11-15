import { describe, expect, it, vi } from "vitest";
import { newsReactionsCollection } from "./newsReactions";
import type { CollectionSource } from "./source";

describe("newsReactions repository", () => {
  it("opens newsReactions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = newsReactionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("newsReactions");
    expect(handle).toEqual({ name: "newsReactions" });
  });
});
