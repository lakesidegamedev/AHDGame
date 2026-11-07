import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { runBankingTurnReadIndexes } from "./2026-11-07-banking-turn-read-indexes";
import { BANKING_TURN_READ_INDEXES } from "../../src/lib/banking/turnReadIndexes";

vi.mock("../utils/db", () => ({ connectDb: vi.fn(), closeDb: vi.fn() }));

describe("banking turn read indexes", () => {
  it("defaults to a read-only dry run", async () => {
    const collection = vi.fn();
    const result = await runBankingTurnReadIndexes({ collection } as unknown as Db);
    expect(collection).not.toHaveBeenCalled();
    expect(result.documentsUpdated).toBe(0);
    expect(result.notes).toHaveLength(3);
  });

  it("applies exactly the bootstrap indexes, sequentially and without uniqueness constraints", async () => {
    const calls: unknown[] = [];
    const db = {
      collection: (name: string) => ({
        createIndex: async (key: unknown, options: unknown) => {
          calls.push({ name, key, options });
        },
      }),
    } as unknown as Db;
    await runBankingTurnReadIndexes(db, { dryRun: false });
    expect(calls).toEqual(
      BANKING_TURN_READ_INDEXES.map((plan) => ({
        name: plan.collection,
        key: plan.key,
        options: { name: plan.name, ...("sparse" in plan ? { sparse: true } : {}) },
      }))
    );
  });
});
