import { describe, expect, it, vi } from "vitest";
import { marketCapTicksCollection } from "./marketCapTicks";
import type { CollectionSource } from "./source";

describe("marketCapTicks repository", () => {
  it("opens marketCapTicks on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = marketCapTicksCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("marketCapTicks");
    expect(handle).toEqual({ name: "marketCapTicks" });
  });
});
