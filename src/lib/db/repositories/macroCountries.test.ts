import { describe, expect, it, vi } from "vitest";
import { macroCountriesCollection } from "./macroCountries";
import type { CollectionSource } from "./source";

describe("macroCountries repository", () => {
  it("opens macroCountries on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = macroCountriesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("macroCountries");
    expect(handle).toEqual({ name: "macroCountries" });
  });
});
