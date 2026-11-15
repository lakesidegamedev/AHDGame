import { describe, expect, it, vi } from "vitest";
import { altDigestStateCollection } from "./altDigestState";
import type { CollectionSource } from "./source";

describe("altDigestState repository", () => {
  it("opens altDigestState on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = altDigestStateCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("altDigestState");
    expect(handle).toEqual({ name: "altDigestState" });
  });
});
