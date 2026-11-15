import { describe, expect, it, vi } from "vitest";
import { achievementsCollection } from "./achievements";
import type { CollectionSource } from "./source";

describe("achievements repository", () => {
  it("opens achievements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = achievementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("achievements");
    expect(handle).toEqual({ name: "achievements" });
  });
});
