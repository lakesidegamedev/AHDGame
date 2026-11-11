import { describe, expect, it, vi } from "vitest";
import { cppccChairElectionsCollection } from "./cppccChairElections";
import type { CollectionSource } from "./source";

describe("cppccChairElections repository", () => {
  it("opens cppccChairElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = cppccChairElectionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("cppccChairElections");
    expect(handle).toEqual({ name: "cppccChairElections" });
  });
});
