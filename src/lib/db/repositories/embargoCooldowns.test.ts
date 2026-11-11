import { describe, expect, it, vi } from "vitest";
import { embargoCooldownsCollection } from "./embargoCooldowns";
import type { CollectionSource } from "./source";

describe("embargoCooldowns repository", () => {
  it("opens embargoCooldowns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = embargoCooldownsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("embargoCooldowns");
    expect(handle).toEqual({ name: "embargoCooldowns" });
  });
});
