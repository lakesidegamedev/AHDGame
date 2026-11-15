import { describe, expect, it, vi } from "vitest";
import { cppccChairNominationsCollection } from "./cppccChairNominations";
import type { CollectionSource } from "./source";

describe("cppccChairNominations repository", () => {
  it("opens cppccChairNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = cppccChairNominationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("cppccChairNominations");
    expect(handle).toEqual({ name: "cppccChairNominations" });
  });
});
