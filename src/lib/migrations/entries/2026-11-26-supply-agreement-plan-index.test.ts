import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { migration } from "./2026-11-26-supply-agreement-plan-index";
import { SUPPLY_CASH_PLAN_INDEX } from "@/lib/corporations/supplyExchange/planIndexes";
describe("supply cash-plan recovery index", () => {
  it("is additive and performs no writes in dry-run mode", async () => {
    const createIndex = vi.fn(async () => "ok"),
      collection = vi.fn(() => ({ createIndex }));
    const db = { collection } as unknown as Db;
    await migration.execute(db, { dryRun: true } as never);
    expect(createIndex).not.toHaveBeenCalled();
    await migration.execute(db, { dryRun: false } as never);
    expect(collection).toHaveBeenCalledWith("bankMoneyMoves");
    expect(createIndex).toHaveBeenCalledWith(
      SUPPLY_CASH_PLAN_INDEX.keys,
      SUPPLY_CASH_PLAN_INDEX.options
    );
  });
});
