import { describe, expect, it, vi } from "vitest";
import { hu1991ConstituencyByElectionsCollection } from "./hu1991ConstituencyByElections";
import type { CollectionSource } from "./source";

describe("hu1991ConstituencyByElections repository", () => {
  it("opens hu1991ConstituencyByElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu1991ConstituencyByElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu1991ConstituencyByElections");
    expect(handle).toEqual({ name: "hu1991ConstituencyByElections" });
  });
});
