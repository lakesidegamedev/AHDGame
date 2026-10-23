import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { migration } from "./2026-10-23-drop-log-text-indexes";

const dbWith = (dropIndex: ReturnType<typeof vi.fn>) => {
  const collection = vi.fn(() => ({ dropIndex }));
  return { db: { collection } as unknown as Db, collection };
};

describe("2026-10-23-drop-log-text-indexes", () => {
  it("drops both log text indexes", async () => {
    const dropIndex = vi.fn().mockResolvedValue({ ok: 1 });
    const { db, collection } = dbWith(dropIndex);
    const result = await migration.execute(db, { dryRun: false } as never);
    expect(collection.mock.calls.map(([name]) => name)).toEqual([
      "actionAuditLog",
      "financialTxLog",
    ]);
    expect(dropIndex.mock.calls.map(([name]) => name)).toEqual([
      "actionAuditLog_text_search",
      "financialTxLog_text_search",
    ]);
    expect(result.documentsUpdated).toBe(2);
  });

  it("treats a missing index or collection as already done", async () => {
    const dropIndex = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("index not found"), { code: 27 }))
      .mockRejectedValueOnce(Object.assign(new Error("ns not found"), { code: 26 }));
    const result = await migration.execute(dbWith(dropIndex).db, { dryRun: false } as never);
    expect(result.documentsUpdated).toBe(0);
    expect(result.notes).toEqual([
      "actionAuditLog.actionAuditLog_text_search not present",
      "financialTxLog.financialTxLog_text_search not present",
    ]);
  });

  it("fails loudly on any other error", async () => {
    const dropIndex = vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { code: 13 }));
    await expect(
      migration.execute(dbWith(dropIndex).db, { dryRun: false } as never)
    ).rejects.toThrow("denied");
  });

  it("writes nothing on a dry run", async () => {
    const dropIndex = vi.fn();
    await migration.execute(dbWith(dropIndex).db, { dryRun: true } as never);
    expect(dropIndex).not.toHaveBeenCalled();
  });
});
