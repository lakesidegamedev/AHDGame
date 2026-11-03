import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_ICONS } from "./achievementIcons";
import { ACHIEVEMENT_SEED } from "@/lib/seeds/achievements";

/**
 * `AchievementIcon` resolves from an explicit map instead of the whole icon
 * library (that namespace import shipped 218 KB gzipped of unused icons to every
 * profile view). These assertions are what keeps the map honest: a seeded
 * achievement that starts using a new icon must add it here, or the badge would
 * silently render the fallback.
 */
describe("ACHIEVEMENT_ICONS", () => {
  it("covers every icon the seeded catalog uses", () => {
    const used = new Set(ACHIEVEMENT_SEED.map((achievement) => achievement.icon));
    const missing = [...used].filter((icon) => !(icon in ACHIEVEMENT_ICONS));
    expect(missing).toEqual([]);
  });

  it("contains only real icon components", () => {
    for (const [name, icon] of Object.entries(ACHIEVEMENT_ICONS)) {
      expect(typeof icon, name).toBe("object");
    }
  });

  it("is far smaller than the full icon namespace it replaced", () => {
    // lucide-react exports roughly 1,600 icons; the catalog uses 55.
    expect(Object.keys(ACHIEVEMENT_ICONS).length).toBeLessThan(100);
  });
});
