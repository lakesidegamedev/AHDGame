import { describe, expect, it, vi } from "vitest";
import { partyGroupFavorabilityCollection } from "./partyGroupFavorability";
import type { CollectionSource } from "./source";

describe("partyGroupFavorability repository", () => {
  it("opens partyGroupFavorability on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyGroupFavorabilityCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyGroupFavorability");
    expect(handle).toEqual({ name: "partyGroupFavorability" });
  });
});
