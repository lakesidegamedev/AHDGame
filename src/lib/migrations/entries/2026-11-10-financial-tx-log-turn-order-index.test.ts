import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { migration } from "./2026-11-10-financial-tx-log-turn-order-index";

function mockDb() {
  const createIndex = vi.fn(async () => "ok");
  const collection = vi.fn((_name: string) => ({ createIndex }));
  return { db: { collection } as unknown as Db, createIndex, collection };
}

describe("2026-11-10-financial-tx-log-turn-order-index migration", () => {
  it("creates the turn-order index with the seed definition", async () => {
    const { db, createIndex, collection } = mockDb();
    const result = await migration.execute(db, { dryRun: false });
    expect(collection).toHaveBeenCalledWith("financialTxLog");
    expect(createIndex).toHaveBeenCalledWith(
      { turn: -1, createdAt: -1, _id: -1 },
      { name: "financialTxLog_turn_createdAt_id", background: true }
    );
    expect(result.documentsUpdated).toBe(1);
  });

  it("writes nothing on a dry run and is idempotent", async () => {
    const { db, createIndex } = mockDb();
    await migration.execute(db, { dryRun: true });
    expect(createIndex).not.toHaveBeenCalled();
    expect(migration.idempotent).toBe(true);
  });
});
