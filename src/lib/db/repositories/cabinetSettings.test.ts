import { describe, expect, it, vi } from "vitest";
import { cabinetSettingsCollection } from "./cabinetSettings";
import type { CollectionSource } from "./source";

describe("cabinetSettings repository", () => {
  it("opens cabinetSettings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = cabinetSettingsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("cabinetSettings");
    expect(handle).toEqual({ name: "cabinetSettings" });
  });
});
