import { describe, expect, it, vi } from "vitest";
import { npcscChairElectionsCollection } from "./npcscChairElections";
import type { CollectionSource } from "./source";

describe("npcscChairElections repository", () => {
  it("opens npcscChairElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = npcscChairElectionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("npcscChairElections");
    expect(handle).toEqual({ name: "npcscChairElections" });
  });
});
