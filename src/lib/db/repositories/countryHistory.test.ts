import { describe, expect, it, vi } from "vitest";
import { countryHistoryCollection } from "./countryHistory";
import type { CollectionSource } from "./source";

describe("countryHistory repository", () => {
  it("opens countryHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = countryHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("countryHistory");
    expect(handle).toEqual({ name: "countryHistory" });
  });
});
