import { describe, expect, it, vi } from "vitest";
import { ukRecallPetitionsCollection } from "./ukRecallPetitions";
import type { CollectionSource } from "./source";

describe("ukRecallPetitions repository", () => {
  it("opens ukRecallPetitions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukRecallPetitionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukRecallPetitions");
    expect(handle).toEqual({ name: "ukRecallPetitions" });
  });
});
