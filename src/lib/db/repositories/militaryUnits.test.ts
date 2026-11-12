import { describe, expect, it, vi } from "vitest";
import { militaryUnitsCollection } from "./militaryUnits";
import type { CollectionSource } from "./source";

describe("militaryUnits repository", () => {
  it("opens militaryUnits on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = militaryUnitsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("militaryUnits");
    expect(handle).toEqual({ name: "militaryUnits" });
  });
});
