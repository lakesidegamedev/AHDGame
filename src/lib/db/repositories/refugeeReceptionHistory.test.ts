import { describe, expect, it, vi } from "vitest";
import { refugeeReceptionHistoryCollection } from "./refugeeReceptionHistory";
import type { CollectionSource } from "./source";

describe("refugeeReceptionHistory repository", () => {
  it("opens refugeeReceptionHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = refugeeReceptionHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("refugeeReceptionHistory");
    expect(handle).toEqual({ name: "refugeeReceptionHistory" });
  });
});
