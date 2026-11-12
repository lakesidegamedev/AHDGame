import { describe, expect, it, vi } from "vitest";
import { countryStateCollection } from "./countryState";
import type { CollectionSource } from "./source";

describe("countryState repository", () => {
  it("opens countryState on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = countryStateCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("countryState");
    expect(handle).toEqual({ name: "countryState" });
  });
});
