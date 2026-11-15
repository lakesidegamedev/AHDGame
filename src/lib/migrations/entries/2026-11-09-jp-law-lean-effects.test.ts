import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { migration } from "./2026-11-09-jp-law-lean-effects";

describe("2026-11-09-jp-law-lean-effects (retired)", () => {
  it("touches nothing", async () => {
    const db = createMockDb();
    const result = await migration.execute(db as unknown as Db, { dryRun: false });
    expect(result.documentsScanned).toBe(0);
    expect(result.documentsUpdated).toBe(0);
  });
});
