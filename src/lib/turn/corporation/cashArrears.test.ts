/**
 * Cash arrears settlement reads its own idempotency receipts by key.
 *
 * A receipt is either missing (settle) or present (resume it from the journal,
 * which loads the record under its own projection). The existence check itself
 * therefore needs no status and no legs, and a bankMoneyMoves document averages
 * 97 KB of which 95 KB is the frozen plan it would decode for nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { TreasuryCashContext } from "@/lib/nationalization/treasuryLedger";
import type { Corporation } from "@/lib/db/types/corporation";
import { settlePriorCorporateCashArrears } from "./cashArrears";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const CORP = new ObjectId();
const TURN = 42;

function context(): TreasuryCashContext {
  return {
    turn: TURN,
    preset: "1953",
    rates: new Map(),
    treasuryCurrencies: new Map(),
  };
}

function input(db: MockDb) {
  return {
    db: db as unknown as Db,
    context: context(),
    corporationId: CORP.toHexString(),
    currencyCode: "USD" as const,
    localPerAnchor: 1,
    turn: TURN,
    now: new Date("2026-01-01T00:00:00Z"),
  };
}

describe("settlePriorCorporateCashArrears", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("bankMoneyMoves");
    db.collection("corporations");
    db.collection("federalBudget");
  });

  it("reads the operating receipt only to see whether it exists", async () => {
    db.collectionMocks.corporations.findOne.mockResolvedValue({
      _id: CORP,
      liquidCapital: 1_000,
      operatingCashArrearsByCurrency: { USD: 500 },
      operatingCashArrearsLastTurnByCurrency: {},
    } as unknown as Corporation);
    // Present: the settlement is resumed from the journal, which loads the
    // record under its own projection (here: absent, so the resume is partial).
    db.collectionMocks.bankMoneyMoves.findOne
      .mockResolvedValueOnce({ _id: "present" })
      .mockResolvedValue(null);

    await expect(settlePriorCorporateCashArrears(input(db))).rejects.toThrow(/no money move/);

    expect(db.collectionMocks.bankMoneyMoves.findOne).toHaveBeenCalledWith(
      { _id: `corp-operating-arrears-settle:${CORP.toHexString()}:${TURN}` },
      { projection: { _id: 1 } }
    );
  });

  it("reads the tax receipt only to see whether it exists", async () => {
    db.collectionMocks.corporations.findOne.mockResolvedValue({
      _id: CORP,
      liquidCapital: 1_000,
      operatingCashArrearsByCurrency: {},
      operatingCashArrearsLastTurnByCurrency: {},
      federalTaxArrearsAnchorByCountry: { US: 100 },
      federalTaxArrearsLastTurnByCountry: {},
    } as unknown as Corporation);
    db.collectionMocks.bankMoneyMoves.findOne
      .mockResolvedValueOnce({ _id: "present" })
      .mockResolvedValue(null);

    await expect(settlePriorCorporateCashArrears(input(db))).rejects.toThrow(/no money move/);

    expect(db.collectionMocks.bankMoneyMoves.findOne).toHaveBeenCalledWith(
      { _id: `corp-tax-arrears-settle:${CORP.toHexString()}:${TURN}` },
      { projection: { _id: 1 } }
    );
  });
});
