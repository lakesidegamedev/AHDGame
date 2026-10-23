import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { migration } from "./2026-10-23-bank-money-move-unprojected-index";

describe("2026-10-23-bank-money-move-unprojected-index", () => {
  it("creates the partial recovery-queue index on bankMoneyMoves", async () => {
    const createIndex = vi.fn().mockResolvedValue("ok");
    const collection = vi.fn(() => ({ createIndex }));
    const result = await migration.execute(
      { collection } as unknown as Db,
      { dryRun: false } as never
    );

    expect(collection).toHaveBeenCalledWith("bankMoneyMoves");
    expect(createIndex).toHaveBeenCalledWith(
      { projectionsCompletedAt: 1, createdAt: 1 },
      {
        name: "bankMoneyMoves_unprojected_applied",
        partialFilterExpression: { status: "applied", "projections.0": { $exists: true } },
      }
    );
    expect(result.documentsUpdated).toBe(1);
  });

  it("writes nothing on a dry run", async () => {
    const createIndex = vi.fn();
    const result = await migration.execute(
      { collection: () => ({ createIndex }) } as unknown as Db,
      { dryRun: true } as never
    );
    expect(createIndex).not.toHaveBeenCalled();
    expect(result.documentsUpdated).toBe(0);
  });
});
