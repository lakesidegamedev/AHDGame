import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStateCollection: async (db: { collection: (n: string) => unknown }) =>
    db.collection("gameState"),
}));
import { migration } from "./2026-11-10-singleplayer-restore-kill-switch-flags";

function fakeDb(doc: Record<string, unknown> | null) {
  const updateOne = vi.fn(async () => ({}));
  const db = {
    collection: () => ({ findOne: vi.fn(async () => doc), updateOne }),
  } as unknown as Db;
  return { db, updateOne };
}

describe("singleplayer restore kill switch flags", () => {
  it("turns on stored false switches, top level and in the saved setup", async () => {
    const { db, updateOne } = fakeDb({
      eraSystemEnabled: false,
      livingConflictsEnabled: true,
      singleplayerConfig: {
        featureFlags: { eraSystemEnabled: false, autoDisastersEnabled: false },
      },
    });
    const result = await migration.execute(db, { dryRun: false });
    expect(result.documentsUpdated).toBe(1);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "current" },
      {
        $set: {
          eraSystemEnabled: true,
          "singleplayerConfig.featureFlags.eraSystemEnabled": true,
          "singleplayerConfig.featureFlags.autoDisastersEnabled": true,
        },
      }
    );
  });

  it("writes nothing on a dry run or when nothing is off", async () => {
    const dry = fakeDb({ eraSystemEnabled: false });
    await migration.execute(dry.db, { dryRun: true });
    expect(dry.updateOne).not.toHaveBeenCalled();
    const clean = fakeDb({ eraSystemEnabled: true });
    expect((await migration.execute(clean.db, { dryRun: false })).documentsUpdated).toBe(0);
    expect(clean.updateOne).not.toHaveBeenCalled();
  });
});
