import { describe, expect, it, vi } from "vitest";
import { cabinetNominationsCollection } from "./cabinetNominations";
import type { CollectionSource } from "./source";

describe("cabinetNominations repository", () => {
  it("opens cabinetNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = cabinetNominationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("cabinetNominations");
    expect(handle).toEqual({ name: "cabinetNominations" });
  });
});
