import { describe, expect, it, vi } from "vitest";
import { ukCabinetCooldownsCollection } from "./ukCabinetCooldowns";
import type { CollectionSource } from "./source";

describe("ukCabinetCooldowns repository", () => {
  it("opens ukCabinetCooldowns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukCabinetCooldownsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukCabinetCooldowns");
    expect(handle).toEqual({ name: "ukCabinetCooldowns" });
  });
});
