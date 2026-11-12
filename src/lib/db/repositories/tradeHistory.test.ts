import { describe, expect, it, vi } from "vitest";
import { tradeHistoryCollection } from "./tradeHistory";
import type { CollectionSource } from "./source";

describe("tradeHistory repository", () => {
  it("opens tradeHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = tradeHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("tradeHistory");
    expect(handle).toEqual({ name: "tradeHistory" });
  });
});
