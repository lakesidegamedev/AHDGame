import { describe, expect, it, vi } from "vitest";
import { crisisAutoCooldownsCollection } from "./crisisAutoCooldowns";
import type { CollectionSource } from "./source";

describe("crisisAutoCooldowns repository", () => {
  it("opens crisisAutoCooldowns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = crisisAutoCooldownsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("crisisAutoCooldowns");
    expect(handle).toEqual({ name: "crisisAutoCooldowns" });
  });
});
