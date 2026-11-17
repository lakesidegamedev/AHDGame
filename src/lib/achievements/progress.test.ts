import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { Achievement } from "@/lib/db/types";
import { getAchievementProgress, getAchievementProgressMap } from "./progress";

function fakeDb() {
  const calls: string[] = [];
  const db = {
    collection: (name: string) => ({
      aggregate: () => ({
        toArray: async () => {
          calls.push(`aggregate:${name}`);
          return [
            { _id: "vote", n: 3 },
            { _id: "supportPlayer", n: 2 },
            { _id: "barnstorm", n: 1 },
          ];
        },
      }),
      countDocuments: async () => {
        calls.push(`count:${name}`);
        return 4;
      },
    }),
  } as unknown as Db;
  return { db, calls };
}

const ach = (triggerType: string, triggerConfig: Record<string, unknown>) =>
  ({ _id: new ObjectId(), triggerType, triggerConfig }) as unknown as Achievement;
const character = { _id: new ObjectId(), userId: new ObjectId(), funds: 50 };

describe("getAchievementProgressMap", () => {
  it("answers many action achievements with one aggregate", async () => {
    const { db, calls } = fakeDb();
    const list = [
      ach("action_count", { count: 10, actionType: "vote" }),
      ach("action_count", { count: 10, actionTypes: ["vote", "supportPlayer"] }),
      ach("action_count", { count: 100 }),
      ach("influence_count", { count: 5 }),
      ach("election_won", { count: 1 }),
      ach("election_won", { count: 2 }),
      ach("funds_threshold", { amount: 1000 }),
    ];
    const map = await getAchievementProgressMap(db, character, list);
    const at = (i: number) => map.get(list[i]._id.toString());
    expect(at(0)).toEqual({ current: 3, target: 10 });
    expect(at(1)).toEqual({ current: 5, target: 10 });
    expect(at(2)).toEqual({ current: 6, target: 100 });
    expect(at(3)).toEqual({ current: 3, target: 5 });
    expect(at(4)).toEqual({ current: 4, target: 1 });
    expect(at(5)).toEqual({ current: 4, target: 2 });
    expect(at(6)).toEqual({ current: 50, target: 1000 });
    expect(calls.filter((c) => c.startsWith("aggregate"))).toHaveLength(1);
    expect(calls.filter((c) => c === "count:electedOfficials")).toHaveLength(1);
  });

  it("returns null for unknown triggers and a single-item wrapper agrees", async () => {
    const { db } = fakeDb();
    const unknown = ach("mystery", {});
    expect(await getAchievementProgress(db, character, unknown)).toBeNull();
    const one = ach("action_count", { count: 5, actionType: "vote" });
    expect(await getAchievementProgress(db, character, one)).toEqual({ current: 3, target: 5 });
    vi.restoreAllMocks();
  });
});
