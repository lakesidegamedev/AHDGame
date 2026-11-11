import { describe, expect, it, vi } from "vitest";
import { shareTradeHistoryCollection } from "./shareTradeHistory";
import type { CollectionSource } from "./source";

describe("shareTradeHistory repository", () => {
  it("opens shareTradeHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = shareTradeHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("shareTradeHistory");
    expect(handle).toEqual({ name: "shareTradeHistory" });
  });
});
