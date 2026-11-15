import { describe, expect, it, vi } from "vitest";
import { bgGrandConstituencyByElectionsCollection } from "./bgGrandConstituencyByElections";
import type { CollectionSource } from "./source";

describe("bgGrandConstituencyByElections repository", () => {
  it("opens bgGrandConstituencyByElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bgGrandConstituencyByElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bgGrandConstituencyByElections");
    expect(handle).toEqual({ name: "bgGrandConstituencyByElections" });
  });
});
