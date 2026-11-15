import { describe, expect, it, vi } from "vitest";
import { npcscChairNominationsCollection } from "./npcscChairNominations";
import type { CollectionSource } from "./source";

describe("npcscChairNominations repository", () => {
  it("opens npcscChairNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = npcscChairNominationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("npcscChairNominations");
    expect(handle).toEqual({ name: "npcscChairNominations" });
  });
});
