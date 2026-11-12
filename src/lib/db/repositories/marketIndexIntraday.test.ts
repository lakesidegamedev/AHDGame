import { describe, expect, it, vi } from "vitest";
import { marketIndexIntradayCollection } from "./marketIndexIntraday";
import type { CollectionSource } from "./source";

describe("marketIndexIntraday repository", () => {
  it("opens marketIndexIntraday on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = marketIndexIntradayCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("marketIndexIntraday");
    expect(handle).toEqual({ name: "marketIndexIntraday" });
  });
});
