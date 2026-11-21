import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { Character } from "@/lib/db/types";

// A batch commits one iteration at a time. When AP runs out partway, the
// earlier iterations are already paid, so the run must report a partial
// success (the client only refreshes the character on a 2xx).
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentTurn: 1, preset: undefined }),
}));
vi.mock("@/lib/currency/featureFlag", () => ({
  isForexEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/achievements/triggers", () => ({
  checkActionAchievements: vi.fn().mockResolvedValue(undefined),
  checkFundsAchievements: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAuditBulk: vi.fn() }));

import { executeCharacterAction } from "./executeAction";
import { recordAuditBulk } from "@/lib/audit/recordAudit";
import { checkActionAchievements, checkFundsAchievements } from "@/lib/achievements/triggers";

const FUNDRAISE_AP = 3;

describe("executeCharacterAction: partial batch", () => {
  function makeDb(start: Character) {
    let current: Character = { ...start };
    const findOneAndUpdate = vi.fn(async (filter: Record<string, unknown>) => {
      const need = (filter.actions as { $gte: number }).$gte;
      if ((current.actions ?? 0) < need) return null;
      current = {
        ...current,
        actions: (current.actions ?? 0) - need,
        funds: (current.funds ?? 0) + 1000,
      };
      return { ...current };
    });
    const findOne = vi.fn(async () => ({ ...current }));
    const actionLogs = {
      insertMany: vi.fn(async (docs: unknown[]) => ({
        insertedIds: Object.fromEntries(docs.map((_, i) => [i, new ObjectId()])),
      })),
      insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
      findOne: vi.fn().mockResolvedValue(null),
    };
    const db = {
      collection: vi.fn((name: string) => {
        if (name === "characters") {
          return { findOne, findOneAndUpdate };
        }
        if (name === "exchangeRates") return { find: () => ({ toArray: async () => [] }) };
        if (name === "actionLogs") return actionLogs;
        return {
          insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
          insertMany: actionLogs.insertMany,
          findOne: vi.fn().mockResolvedValue(null),
        };
      }),
    } as unknown as Db;
    return { db, findOneAndUpdate, findOne, actionLogs };
  }

  const makeCharacter = (actions: number): Character =>
    ({
      _id: new ObjectId(),
      name: "Raiser",
      countryId: "US",
      homeState: "US-NY",
      party: "6",
      actions,
      funds: 0,
      donorBaseLevel: 5,
      favorability: 20,
      politicalInfluence: 10,
    }) as unknown as Character;

  beforeEach(() => vi.clearAllMocks());

  it("returns ok with a stop note when AP runs out mid-batch", async () => {
    const character = makeCharacter(FUNDRAISE_AP * 2 + 1);
    const { db, findOneAndUpdate, actionLogs } = makeDb(character);
    const res = await executeCharacterAction(db, {
      character,
      characterQuery: { _id: character._id },
      actionType: "fundraise",
      count: 5,
      actor: { userId: new ObjectId(), username: "tester" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(res.updatedCharacter.actions).toBe(1);
    expect(res.message).toMatch(/^Stopped after 2 of 5:/);
    expect(res.message).toContain("Completed 2 times.");
    // Audit rows for the committed iterations are still flushed.
    const audit = vi.mocked(recordAuditBulk).mock.calls[0]![0];
    expect(audit).toHaveLength(2);
    // Both committed iterations log in one insert, not one per iteration.
    expect(actionLogs.insertMany).toHaveBeenCalledTimes(1);
    expect(actionLogs.insertOne).not.toHaveBeenCalled();
    const logged = actionLogs.insertMany.mock.calls[0]![0] as unknown[];
    expect(logged).toHaveLength(2);
    // Audit refs still point at the log row for their own iteration.
    const insertedIds = (
      (await actionLogs.insertMany.mock.results[0]!.value) as {
        insertedIds: Record<number, { toString(): string }>;
      }
    ).insertedIds;
    expect(audit[0]!.refs?.actionLogId?.toString()).toBe(insertedIds[0]!.toString());
    expect(audit[1]!.refs?.actionLogId?.toString()).toBe(insertedIds[1]!.toString());
  });

  it("reuses the updated character and checks achievements once per batch", async () => {
    const character = makeCharacter(FUNDRAISE_AP * 4);
    const { db, findOne, findOneAndUpdate, actionLogs } = makeDb(character);
    const res = await executeCharacterAction(db, {
      character,
      characterQuery: { _id: character._id },
      actionType: "fundraise",
      count: 4,
      actor: { userId: new ObjectId(), username: "tester" },
    });
    expect(res.ok).toBe(true);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(4);
    expect(actionLogs.insertMany).toHaveBeenCalledTimes(1);
    expect(actionLogs.insertMany.mock.calls[0]![0]).toHaveLength(4);
    // Iterations 2-4 read the document the previous atomic update returned, so
    // a batch of four opens no extra character reads.
    expect(findOne).not.toHaveBeenCalled();
    // Achievement triggers read cumulative counts: once per request is enough.
    expect(vi.mocked(checkActionAchievements)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkFundsAchievements)).toHaveBeenCalledTimes(1);
    if (!res.ok) return;
    expect(vi.mocked(checkActionAchievements).mock.calls[0]).toEqual([
      expect.anything(),
      res.updatedCharacter._id,
      "fundraise",
      1,
    ]);
  });

  it("still errors when the very first iteration is refused", async () => {
    const character = makeCharacter(1);
    const { db, actionLogs } = makeDb(character);
    const res = await executeCharacterAction(db, {
      character,
      characterQuery: { _id: character._id },
      actionType: "fundraise",
      count: 5,
      actor: { userId: new ObjectId(), username: "tester" },
    });
    expect(res.ok).toBe(false);
    // Nothing committed in the batch, so no action log row is written at all.
    expect(actionLogs.insertMany).not.toHaveBeenCalled();
    expect(actionLogs.insertOne).not.toHaveBeenCalled();
  });

  it("logs safe timing totals and completed batch count", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const character = makeCharacter(30);
    const { db } = makeDb(character);
    await executeCharacterAction(db, {
      character,
      characterQuery: { _id: character._id },
      actionType: "fundraise",
      count: 5,
      actor: { userId: new ObjectId(), username: "tester" },
    });
    const timing = info.mock.calls.find(
      ([label]) => label === "[action-core-timing]"
    )?.[1] as Record<string, unknown>;
    expect(timing).toEqual(
      expect.objectContaining({ actionType: "fundraise", requestedCount: 5, completedCount: 5 })
    );
    expect(timing).toHaveProperty("dbUpdateMs");
    expect(JSON.stringify(timing)).not.toMatch(/tester|Raiser|[0-9a-f]{24}/);
    info.mockRestore();
  });

  it("completes a full batch with no stop note", async () => {
    const character = makeCharacter(30);
    const { db } = makeDb(character);
    const res = await executeCharacterAction(db, {
      character,
      characterQuery: { _id: character._id },
      actionType: "fundraise",
      count: 5,
      actor: { userId: new ObjectId(), username: "tester" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.message).not.toContain("Stopped");
  });
});
