import { describe, expect, it, vi } from "vitest";
import { countryLeaderStatesCollection } from "./countryLeaderStates";
import type { CollectionSource } from "./source";

describe("countryLeaderStates repository", () => {
  it("opens countryLeaderStates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = countryLeaderStatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("countryLeaderStates");
    expect(handle).toEqual({ name: "countryLeaderStates" });
  });
});
