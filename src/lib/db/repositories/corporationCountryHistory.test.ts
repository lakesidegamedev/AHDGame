import { describe, expect, it, vi } from "vitest";
import { corporationCountryHistoryCollection } from "./corporationCountryHistory";
import type { CollectionSource } from "./source";

describe("corporationCountryHistory repository", () => {
  it("opens corporationCountryHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationCountryHistoryCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporationCountryHistory");
    expect(handle).toEqual({ name: "corporationCountryHistory" });
  });
});
