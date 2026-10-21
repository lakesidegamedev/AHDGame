import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { Corporation } from "@/lib/db/types";
import { evaluateCeoSalaryVote } from "./ceoSalaryVote";

vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/corporationCapital")>()),
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map()),
}));

function corp(overrides: Partial<Corporation> = {}): Corporation {
  return {
    _id: new ObjectId(),
    ceoSalary: 100,
    // 365 000 a year = 1 000 a day
    earningsHistory: [365_000, 365_000],
    ...overrides,
  } as Corporation;
}

describe("evaluateCeoSalaryVote", () => {
  let db: MockDb;
  const withShare = (share: number | undefined) => {
    db.collection("gameConfig");
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue(
      share === undefined ? null : { ceoSalaryVoteNetIncomeShare: share }
    );
  };
  beforeEach(() => {
    db = createMockDb();
  });

  it("is off while the knob is unset", async () => {
    withShare(undefined);
    expect((await evaluateCeoSalaryVote(db as unknown as Db, corp(), 99_999)).required).toBe(false);
  });

  it("asks for a vote when a rise passes the share of net income", async () => {
    withShare(0.25);
    const ok = await evaluateCeoSalaryVote(db as unknown as Db, corp(), 250);
    expect(ok.required).toBe(false);
    const over = await evaluateCeoSalaryVote(db as unknown as Db, corp(), 251);
    expect(over.required).toBe(true);
    expect(over.freeCeilingLocal).toBeCloseTo(250, 6);
  });

  it("exempts private corporations, NPP-run corporations and state-owned ones", async () => {
    withShare(0.25);
    for (const overrides of [
      { isPrivate: true },
      { ceoType: "npp" as const },
      { countryOwnerId: "US" },
    ]) {
      const res = await evaluateCeoSalaryVote(
        db as unknown as Db,
        corp(overrides as Partial<Corporation>),
        99_999
      );
      expect(res.required).toBe(false);
    }
  });

  it("asks for a vote on any rise when there is no positive net income", async () => {
    withShare(0.25);
    const res = await evaluateCeoSalaryVote(
      db as unknown as Db,
      corp({ earningsHistory: [-1000, 0] }),
      101
    );
    expect(res.required).toBe(true);
    expect(res.noPositiveNetIncome).toBe(true);
  });
});
