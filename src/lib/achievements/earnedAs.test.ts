import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/mongodb";
import { awardAchievement, awardAchievements, loadAccountAchievements } from "./index";
import { setCachedDefinitions } from "./cache";
import { earnedAsName, normalizeEarnedAsName } from "./earnedAs";
import { loadCharacterNames, withCharacterName } from "./characterNames";

const userId = new ObjectId();
const reagan = { _id: new ObjectId(), userId, name: "Ronald Reagan", createdAt: new Date(1) };
const president = { _id: new ObjectId(), slug: "president", name: "President", order: 1 };
const veep = { _id: new ObjectId(), slug: "vice_president", name: "Vice President", order: 2 };

function mockDb(rows: Array<Record<string, unknown>> = []) {
  const insertOne = vi.fn().mockResolvedValue({});
  const insertMany = vi.fn().mockResolvedValue({});
  const db = {
    collection: (name: string) => {
      if (name === "characters") {
        return {
          findOne: async (q: { _id?: ObjectId }) =>
            q._id && reagan._id.equals(q._id) ? reagan : null,
          find: (q: { _id: { $in: ObjectId[] } }) => ({
            toArray: async () =>
              q._id.$in.some((id) => id.equals(reagan._id))
                ? [{ _id: reagan._id, name: reagan.name }]
                : [],
          }),
        };
      }
      if (name === "characterAchievements") {
        return {
          find: () => ({ toArray: async () => rows }),
          insertOne,
          insertMany,
        };
      }
      if (name === "achievements") {
        return { find: () => ({ toArray: async () => [president, veep] }) };
      }
      return {};
    },
  };
  vi.mocked(getDb).mockResolvedValue(db as never);
  return { db, insertOne, insertMany };
}

describe("earnedAsName", () => {
  it("names the earning character when it differs from the profile in view", () => {
    expect(earnedAsName("Ronald Reagan", "Dwight David Eisenhower")).toBe("Ronald Reagan");
  });

  it("shows nothing when the award was earned under the viewed name", () => {
    expect(earnedAsName("Ronald Reagan", "Ronald Reagan")).toBeNull();
    expect(earnedAsName(" ronald reagan ", "Ronald Reagan")).toBeNull();
  });

  it("falls back to showing nothing for awards with no stored name", () => {
    expect(earnedAsName(undefined, "Dwight David Eisenhower")).toBeNull();
    expect(earnedAsName("   ", "Dwight David Eisenhower")).toBeNull();
    expect(normalizeEarnedAsName(42)).toBeNull();
  });
});

describe("storing the earning character's name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCachedDefinitions([president, veep] as never);
  });

  it("stamps the character's current name on a new award", async () => {
    const { insertOne } = mockDb();
    await expect(awardAchievement(userId, "president", reagan._id)).resolves.toBe(true);
    expect(insertOne.mock.calls[0][0]).toMatchObject({
      characterId: reagan._id,
      characterName: "Ronald Reagan",
    });
  });

  it("uses a staff supplied name over the current one", async () => {
    const { insertOne } = mockDb();
    await awardAchievement(userId, "president", reagan._id, undefined, {
      characterName: "  Abraham Lincoln ",
    });
    expect(insertOne.mock.calls[0][0].characterName).toBe("Abraham Lincoln");
  });

  it("writes no name when the award has no character", async () => {
    const { insertOne } = mockDb();
    await awardAchievement(userId, "president");
    expect(insertOne.mock.calls[0][0]).not.toHaveProperty("characterName");
  });

  it("stamps the name on every row of a batch award", async () => {
    const { insertMany } = mockDb();
    await expect(
      awardAchievements(userId, ["president", "vice_president"], reagan._id)
    ).resolves.toBe(2);
    const docs = insertMany.mock.calls[0][0] as Array<{ characterName?: string }>;
    expect(docs.map((doc) => doc.characterName)).toEqual(["Ronald Reagan", "Ronald Reagan"]);
  });

  it("returns the stored name with each earned award", async () => {
    mockDb([
      {
        userId,
        characterId: reagan._id,
        achievementId: president._id,
        earnedAt: new Date(2),
        characterName: "Ronald Reagan",
      },
      { userId, achievementId: veep._id, earnedAt: new Date(3) },
    ]);
    const rows = await loadAccountAchievements(userId);
    expect(rows.map((row) => [row.achievement.slug, row.characterName])).toEqual([
      ["president", "Ronald Reagan"],
      ["vice_president", undefined],
    ]);
  });

  it("looks names up in one read and skips characters that are gone", async () => {
    const { db } = mockDb();
    const gone = new ObjectId();
    const names = await loadCharacterNames(db as never, [reagan._id, gone, undefined]);
    expect([...names.values()]).toEqual(["Ronald Reagan"]);
    expect(withCharacterName({ characterId: gone }, names)).not.toHaveProperty("characterName");
    expect(withCharacterName({ characterId: reagan._id }, names).characterName).toBe(
      "Ronald Reagan"
    );
  });
});
