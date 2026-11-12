import { describe, expect, it, vi } from "vitest";
import { hu2011ConstituencyByElectionsCollection } from "./hu2011ConstituencyByElections";
import type { CollectionSource } from "./source";

describe("hu2011ConstituencyByElections repository", () => {
  it("opens hu2011ConstituencyByElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu2011ConstituencyByElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu2011ConstituencyByElections");
    expect(handle).toEqual({ name: "hu2011ConstituencyByElections" });
  });
});
