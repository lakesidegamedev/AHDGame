import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/mongodb";
import { awardAchievement, getAchievementRarityMap } from "./index";
import { invalidateRarityCache, setCachedDefinitions } from "./cache";

const userId = new ObjectId();
const first = { _id: new ObjectId(), userId, createdAt: new Date("2026-11-01") };
const second = { _id: new ObjectId(), userId, createdAt: new Date("2026-11-20") };
const hat = { _id: new ObjectId(), slug: "first_fundraise", order: 1 };

function mockDb(rows: Array<{ characterId?: ObjectId }>) {
  const insertOne = vi.fn().mockResolvedValue({});
  const chars = [first, second];
  const db = {
    collection: (name: string) => {
      if (name === "characters") {
        return {
          findOne: async (q: { _id?: ObjectId | { $ne: ObjectId }; createdAt?: unknown }) => {
            if (q.createdAt) {
              return chars.find((c) => c.createdAt < (q.createdAt as { $lt: Date }).$lt) ?? null;
            }
            return chars.find((c) => c._id.equals(q._id as ObjectId)) ?? null;
          },
        };
      }
      if (name === "characterAchievements") {
        return {
          find: () => ({ toArray: async () => rows }),
          insertOne,
          countDocuments: async () => 0,
        };
      }
      return {};
    },
  };
  vi.mocked(getDb).mockResolvedValue(db as never);
  return insertOne;
}

describe("awarding to characters on a shared account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCachedDefinitions([hat] as never);
  });

  it("awards a second character an achievement a sibling already earned", async () => {
    const insertOne = mockDb([{ characterId: first._id }]);
    await expect(awardAchievement(userId, "first_fundraise", second._id)).resolves.toBe(true);
    expect(insertOne).toHaveBeenCalledTimes(1);
  });

  it("does not award twice to the same character", async () => {
    const insertOne = mockDb([{ characterId: second._id }]);
    await expect(awardAchievement(userId, "first_fundraise", second._id)).resolves.toBe(false);
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("treats an untagged legacy row as held by the first character only", async () => {
    const insertOne = mockDb([{}]);
    await expect(awardAchievement(userId, "first_fundraise", first._id)).resolves.toBe(false);
    await expect(awardAchievement(userId, "first_fundraise", second._id)).resolves.toBe(true);
    expect(insertOne).toHaveBeenCalledTimes(1);
  });
});

describe("getAchievementRarityMap", () => {
  it("counts accounts, not rows, and never passes 100%", async () => {
    invalidateRarityCache();
    const a = new ObjectId();
    const u1 = new ObjectId();
    const u2 = new ObjectId();
    vi.mocked(getDb).mockResolvedValue({
      collection: (name: string) =>
        name === "characters"
          ? { distinct: async () => [u1, u2] }
          : {
              distinct: async () => [u1, u2],
              aggregate: () => ({ toArray: async () => [{ _id: a, count: 2 }] }),
            },
    } as never);
    const map = await getAchievementRarityMap();
    expect(map.get(a.toString())).toBe(100);
  });
});
