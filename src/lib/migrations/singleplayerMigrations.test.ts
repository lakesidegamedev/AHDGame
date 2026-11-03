import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";

const mocks = vi.hoisted(() => ({
  runMigrations: vi.fn(),
  resumePending: vi.fn(),
  runRequiredStartupMigrations: vi.fn(),
}));

vi.mock("@/lib/demographics/flowJournal", () => ({
  resumePendingDemographicFlowReceipts: mocks.resumePending,
}));

vi.mock("./runner", () => ({ runMigrations: mocks.runMigrations }));
vi.mock("./startupMigrations", () => ({
  runRequiredStartupMigrations: mocks.runRequiredStartupMigrations,
}));

import {
  SINGLEPLAYER_BASELINE_MARKER,
  SINGLEPLAYER_LEGACY_CUTOFF,
  SINGLEPLAYER_MIGRATIONS,
  migrateSingleplayerWorld,
  stampSingleplayerBaseline,
} from "./singleplayerMigrations";

const empty = { ranIds: [], skippedIds: [], results: {}, dryRun: false };

function fakeDb({
  world,
  stamped,
  interrupted = false,
}: {
  world: boolean;
  stamped: boolean;
  interrupted?: boolean;
}) {
  const bulkWrite = vi.fn(async (ops: unknown[]) => ({ upsertedCount: ops.length }));
  const db = {
    collection: (name: string) => ({
      findOne: async (filter: { _id: string }) => {
        if (name === "gameState")
          return world
            ? {
                _id: "current",
                ...(interrupted ? { worldEpochId: "old-save", currentTurn: 12 } : {}),
              }
            : null;
        if (filter._id === SINGLEPLAYER_BASELINE_MARKER) return stamped ? filter : null;
        return null;
      },
      bulkWrite,
    }),
  } as unknown as Db;
  return { db, bulkWrite };
}

describe("singleplayer migrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resumePending.mockResolvedValue([]);
    mocks.runMigrations.mockResolvedValue({ ...empty, ranIds: ["chain"] });
    mocks.runRequiredStartupMigrations.mockResolvedValue({ ...empty, ranIds: ["required"] });
  });

  it("includes county stocks, which the hosted chain holds", () => {
    expect(SINGLEPLAYER_MIGRATIONS.map((m) => m.id)).toContain("2026-10-30-county-populations");
  });

  it("finishes frozen receipts before migrations in an interrupted singleplayer save", async () => {
    const { db } = fakeDb({ world: true, stamped: true, interrupted: true });
    await migrateSingleplayerWorld(db);
    expect(mocks.resumePending).toHaveBeenCalledWith(db, "old-save", 13);
    expect(mocks.resumePending.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runMigrations.mock.invocationCallOrder[0]
    );
  });

  it("retains the migration marker for retry if receipt recovery fails, and still runs required repairs", async () => {
    const { db, bulkWrite } = fakeDb({ world: true, stamped: true, interrupted: true });
    mocks.resumePending.mockRejectedValueOnce(new Error("invalid frozen target"));
    await expect(migrateSingleplayerWorld(db)).rejects.toThrow("invalid frozen target");
    expect(mocks.runMigrations).not.toHaveBeenCalled();
    expect(mocks.runRequiredStartupMigrations).toHaveBeenCalledWith(db);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("does nothing without a world; creating one stamps the baseline", async () => {
    const { db } = fakeDb({ world: false, stamped: false });
    expect(await migrateSingleplayerWorld(db)).toBeNull();
    expect(mocks.runMigrations).not.toHaveBeenCalled();
  });

  it("catches a pre-baseline save up from the legacy cutoff only", async () => {
    const { db, bulkWrite } = fakeDb({ world: true, stamped: false });
    const summary = await migrateSingleplayerWorld(db);
    const ids: string[] = mocks.runMigrations.mock.calls[0][1].migrations.map(
      (m: { id: string }) => m.id
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.slice(0, 10) >= SINGLEPLAYER_LEGACY_CUTOFF)).toBe(true);
    expect(ids).toContain("2026-10-30-county-populations");
    expect(summary?.ranIds).toEqual(["chain", "required"]);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
  });

  it("walks the whole chain for a stamped world, letting markers decide", async () => {
    const { db } = fakeDb({ world: true, stamped: true });
    await migrateSingleplayerWorld(db);
    expect(mocks.runMigrations.mock.calls[0][1].migrations).toHaveLength(
      SINGLEPLAYER_MIGRATIONS.length
    );
  });

  it("still applies required repairs when the chain fails, and stamps nothing", async () => {
    const { db, bulkWrite } = fakeDb({ world: true, stamped: false });
    mocks.runMigrations.mockRejectedValueOnce(new Error("pending receipts"));
    await expect(migrateSingleplayerWorld(db)).rejects.toThrow(/pending receipts/);
    expect(mocks.runRequiredStartupMigrations).toHaveBeenCalledTimes(1);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("stamps every migration and the baseline marker without overwriting", async () => {
    const { db, bulkWrite } = fakeDb({ world: true, stamped: false });
    await stampSingleplayerBaseline(db);
    const ops = bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { filter: { _id: string }; update: Record<string, unknown>; upsert: boolean };
    }>;
    expect(ops).toHaveLength(SINGLEPLAYER_MIGRATIONS.length + 1);
    expect(ops.map((op) => op.updateOne.filter._id)).toContain(SINGLEPLAYER_BASELINE_MARKER);
    expect(ops.every((op) => op.updateOne.upsert && "$setOnInsert" in op.updateOne.update)).toBe(
      true
    );
  });
});
