import { describe, expect, it, vi } from "vitest";
import { countryGameStatesCollection } from "./countryGameStates";
import type { CollectionSource } from "./source";

describe("countryGameStates repository", () => {
  it("opens countryGameStates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = countryGameStatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("countryGameStates");
    expect(handle).toEqual({ name: "countryGameStates" });
  });
});
