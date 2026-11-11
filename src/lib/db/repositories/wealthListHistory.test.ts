import { describe, expect, it, vi } from "vitest";
import { wealthListHistoryCollection } from "./wealthListHistory";
import type { CollectionSource } from "./source";

describe("wealthListHistory repository", () => {
  it("opens wealthListHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = wealthListHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("wealthListHistory");
    expect(handle).toEqual({ name: "wealthListHistory" });
  });
});
