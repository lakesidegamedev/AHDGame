import { describe, expect, it, vi } from "vitest";
import { crisisLeverUsesCollection } from "./crisisLeverUses";
import type { CollectionSource } from "./source";

describe("crisisLeverUses repository", () => {
  it("opens crisisLeverUses on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = crisisLeverUsesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("crisisLeverUses");
    expect(handle).toEqual({ name: "crisisLeverUses" });
  });
});
