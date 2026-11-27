import { describe, it, expect } from "vitest";
import { type Db } from "mongodb";
import {
  getDiplomaticActionsRemaining,
  remainingFromRow,
  spendDiplomaticAction,
} from "./diplomaticActions";
import { DIPLOMATIC_ACTIONS_PER_TURN } from "@/lib/constants/internationalOrganizations";

import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
function makeDb(): Db {
  return createTransactionalMemoryDb().db;
}

describe("remainingFromRow (pure)", () => {
  it("refuses future, malformed and nonfinite budgets", () => {
    expect(remainingFromRow({ turn: 11, remaining: 4 }, 10)).toBe(0);
    expect(remainingFromRow({ turn: 10, remaining: NaN }, 10)).toBe(0);
    expect(remainingFromRow(null, NaN)).toBe(0);
  });
  it("a missing row reads as full budget", () => {
    expect(remainingFromRow(null, 10)).toBe(DIPLOMATIC_ACTIONS_PER_TURN);
  });
  it("a stale (older-turn) row reads as full budget", () => {
    expect(remainingFromRow({ turn: 9, remaining: 0 }, 10)).toBe(DIPLOMATIC_ACTIONS_PER_TURN);
  });
  it("a current-turn row reports its clamped remaining", () => {
    expect(remainingFromRow({ turn: 10, remaining: 2 }, 10)).toBe(2);
    expect(remainingFromRow({ turn: 10, remaining: 99 }, 10)).toBe(DIPLOMATIC_ACTIONS_PER_TURN);
    expect(remainingFromRow({ turn: 10, remaining: -3 }, 10)).toBe(0);
  });
});

describe("diplomatic action budget (stateful)", () => {
  it("a fresh country has the full budget", async () => {
    const db = makeDb();
    expect(await getDiplomaticActionsRemaining(db, "US", 10)).toBe(DIPLOMATIC_ACTIONS_PER_TURN);
  });

  it("spending decrements within a turn", async () => {
    const db = makeDb();
    const r1 = await spendDiplomaticAction(db, "US", 10);
    expect(r1).toEqual({ ok: true, remaining: DIPLOMATIC_ACTIONS_PER_TURN - 1 });
    expect(await getDiplomaticActionsRemaining(db, "US", 10)).toBe(DIPLOMATIC_ACTIONS_PER_TURN - 1);
  });

  it("rejects once the budget is exhausted", async () => {
    const db = makeDb();
    for (let i = 0; i < DIPLOMATIC_ACTIONS_PER_TURN; i++) {
      expect((await spendDiplomaticAction(db, "US", 10)).ok).toBe(true);
    }
    const over = await spendDiplomaticAction(db, "US", 10);
    expect(over).toEqual({ ok: false, remaining: 0 });
  });

  it("refreshes to full on a new turn", async () => {
    const db = makeDb();
    await spendDiplomaticAction(db, "US", 10);
    expect(await getDiplomaticActionsRemaining(db, "US", 11)).toBe(DIPLOMATIC_ACTIONS_PER_TURN);
    const r = await spendDiplomaticAction(db, "US", 11);
    expect(r.remaining).toBe(DIPLOMATIC_ACTIONS_PER_TURN - 1);
  });

  it("overlapping first spends cannot mint extra actions", async () => {
    const db = makeDb();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => spendDiplomaticAction(db, "CA", 10))
    );
    expect(results.filter((r) => r.ok)).toHaveLength(DIPLOMATIC_ACTIONS_PER_TURN);
    expect(await db.collection("diplomaticActions").countDocuments({ countryId: "CA" })).toBe(1);
  });
  it("budgets are independent per country", async () => {
    const db = makeDb();
    await spendDiplomaticAction(db, "US", 10);
    expect(await getDiplomaticActionsRemaining(db, "UK", 10)).toBe(DIPLOMATIC_ACTIONS_PER_TURN);
  });
});
