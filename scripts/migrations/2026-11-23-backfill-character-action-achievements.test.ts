import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Achievement } from "@/lib/db/types";

vi.mock("../utils/db", () => ({ connectDb: vi.fn(), closeDb: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

import { planBackfill } from "./2026-11-23-backfill-character-action-achievements";

const userId = new ObjectId();
const first = { _id: new ObjectId(), userId, additional: false };
const second = { _id: new ObjectId(), userId, additional: true };
const hat = { _id: new ObjectId(), slug: "first_fundraise", triggerType: "action_count" };
const rich = { _id: new ObjectId(), slug: "millionaire", triggerType: "funds_threshold" };
const achievements = [hat, rich] as unknown as Achievement[];

describe("planBackfill", () => {
  it("grants a character the action achievement it met while a sibling holds it", () => {
    const grants = planBackfill({
      characters: [first, second],
      achievements,
      heldRows: [{ userId, characterId: first._id, achievementId: hat._id }],
      progress: () => ({ current: 2, target: 1 }),
    });
    expect(grants.map((g) => [g.characterId.toString(), g.slug])).toEqual([
      [second._id.toString(), "first_fundraise"],
    ]);
  });

  it("skips unmet targets and non-action achievements", () => {
    const grants = planBackfill({
      characters: [first],
      achievements,
      heldRows: [],
      progress: () => ({ current: 0, target: 1 }),
    });
    expect(grants).toEqual([]);
  });

  it("ignores held rows with no account id instead of failing", () => {
    const grants = planBackfill({
      characters: [first],
      achievements: [hat],
      heldRows: [{ userId: undefined, achievementId: hat._id }],
      progress: () => ({ current: 5, target: 1 }),
    });
    expect(grants).toHaveLength(1);
  });

  it("treats a row on the character as held even without an account id", () => {
    const grants = planBackfill({
      characters: [first],
      achievements: [hat],
      heldRows: [{ userId: undefined, characterId: first._id, achievementId: hat._id }],
      progress: () => ({ current: 5, target: 1 }),
    });
    expect(grants).toHaveLength(0);
  });
});
