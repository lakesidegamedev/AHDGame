import { describe, expect, it, vi } from "vitest";
import { marketCapHistoryCollection } from "./marketCapHistory";
import type { CollectionSource } from "./source";

describe("marketCapHistory repository", () => {
  it("opens marketCapHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = marketCapHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("marketCapHistory");
    expect(handle).toEqual({ name: "marketCapHistory" });
  });
});
