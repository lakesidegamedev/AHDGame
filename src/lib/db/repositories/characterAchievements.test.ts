import { describe, expect, it, vi } from "vitest";
import { characterAchievementsCollection } from "./characterAchievements";
import type { CollectionSource } from "./source";

describe("characterAchievements repository", () => {
  it("opens characterAchievements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = characterAchievementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("characterAchievements");
    expect(handle).toEqual({ name: "characterAchievements" });
  });
});
