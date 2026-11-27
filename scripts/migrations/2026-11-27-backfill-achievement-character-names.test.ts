import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

vi.mock("../utils/db", () => ({ connectDb: vi.fn(), closeDb: vi.fn() }));

import {
  backfillAchievementCharacterNames,
  planCharacterNameBackfill,
} from "./2026-11-27-backfill-achievement-character-names";

const live = new ObjectId();
const gone = new ObjectId();
const names = new Map([[live.toString(), "Ronald Reagan"]]);

describe("planCharacterNameBackfill", () => {
  it("fills rows whose character still exists and leaves the rest blank", () => {
    const filled = new ObjectId();
    const plan = planCharacterNameBackfill(
      [
        { _id: filled, characterId: live },
        { _id: new ObjectId(), characterId: gone },
        { _id: new ObjectId() },
        { _id: new ObjectId(), characterId: live, characterName: "Abraham Lincoln" },
      ],
      names
    );
    expect(plan.updates).toEqual([{ rowId: filled, characterName: "Ronald Reagan" }]);
    expect(plan.characterGone).toBe(1);
    expect(plan.withoutCharacter).toBe(1);
  });

  it("treats a blank stored name as missing", () => {
    const row = { _id: new ObjectId(), characterId: live, characterName: " " };
    expect(planCharacterNameBackfill([row], names).updates).toHaveLength(1);
  });
});

function mockDb(rows: Array<Record<string, unknown>>) {
  const bulkWrite = vi.fn().mockImplementation(async (ops: unknown[]) => ({
    modifiedCount: ops.length,
  }));
  const db = {
    collection: (name: string) => {
      if (name === "characterAchievements") {
        return { find: () => ({ toArray: async () => rows }), bulkWrite };
      }
      if (name === "characters") {
        return { find: () => ({ toArray: async () => [{ _id: live, name: "Ronald Reagan" }] }) };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return { db, bulkWrite };
}

describe("backfillAchievementCharacterNames", () => {
  const rows = [
    { _id: new ObjectId(), characterId: live },
    { _id: new ObjectId(), characterId: gone },
  ];

  it("writes nothing on a dry run", async () => {
    const { db, bulkWrite } = mockDb(rows);
    const report = await backfillAchievementCharacterNames(db as never, { apply: false });
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      mode: "dry-run",
      rowsWithoutName: 2,
      rowsFilled: 1,
      rowsCharacterGone: 1,
    });
  });

  it("sets the name only where none is stored yet", async () => {
    const { db, bulkWrite } = mockDb(rows);
    const report = await backfillAchievementCharacterNames(db as never, { apply: true });
    expect(report.rowsFilled).toBe(1);
    const [op] = bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { filter: Record<string, unknown>; update: unknown };
    }>;
    expect(op.updateOne.filter._id).toEqual(rows[0]._id);
    expect(op.updateOne.filter.characterName).toEqual({ $in: [null, ""] });
    expect(op.updateOne.update).toEqual({ $set: { characterName: "Ronald Reagan" } });
  });
});
