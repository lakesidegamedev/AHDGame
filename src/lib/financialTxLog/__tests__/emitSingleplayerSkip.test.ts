import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { DEFAULT_TX_THRESHOLDS, type FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { emitTxBulk, SINGLEPLAYER_UNREAD_TX_TYPES, type TxInput } from "../emit";

const emitLedgerEntries = vi.fn();
vi.mock("@/lib/ledger/featureFlag", () => ({
  isLedgerShadowEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/ledger/emit", () => ({
  emitLedgerEntries: (...args: unknown[]) => emitLedgerEntries(...args),
}));
vi.mock("@/lib/audit/recordAudit", () => ({
  recordAudit: vi.fn(),
  recordAuditBulk: vi.fn(),
}));

function entry(type: FinancialTxLogEntry["type"], subjectType: TxInput["subjectType"]): TxInput {
  return {
    type,
    turn: 4,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    subjectType,
    subjectId: new ObjectId(),
    subjectName: "Synthetic subject",
    amount: 100,
    anchorAmount: 100,
    currencyCode: "USD",
  };
}

function mockDb() {
  const db = createMockDb();
  db.collection("financialTxLog");
  db.collection("gameConfig");
  return db;
}

describe("emitTxBulk in singleplayer", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("stores every row on a hosted deployment", async () => {
    const db = mockDb();
    await emitTxBulk(
      db as never,
      [entry("party_dues_received", "party"), entry("corp_revenue", "corporation")],
      DEFAULT_TX_THRESHOLDS
    );
    const [docs] = db.collectionMocks.financialTxLog.insertMany.mock.calls[0];
    expect(docs.map((d: FinancialTxLogEntry) => d.type)).toEqual([
      "party_dues_received",
      "corp_revenue",
    ]);
  });

  it("drops only the unread row types and keeps the rest", async () => {
    vi.stubEnv("SINGLEPLAYER", "1");
    const db = mockDb();
    await emitTxBulk(
      db as never,
      [
        entry("party_dues_received", "party"),
        entry("corp_tax_paid", "corporation"),
        entry("bond_coupon", "corporation"),
      ],
      DEFAULT_TX_THRESHOLDS
    );
    const [docs] = db.collectionMocks.financialTxLog.insertMany.mock.calls[0];
    expect(docs.map((d: FinancialTxLogEntry) => d.type)).toEqual(["bond_coupon"]);
  });

  it("writes nothing when every row is an unread type, but still feeds the shadow ledger", async () => {
    vi.stubEnv("SINGLEPLAYER", "1");
    const db = mockDb();
    await emitTxBulk(
      db as never,
      [entry("party_dues_received", "party"), entry("corp_operating_loss", "corporation")],
      DEFAULT_TX_THRESHOLDS
    );
    expect(db.collectionMocks.financialTxLog.insertMany).not.toHaveBeenCalled();
    expect(emitLedgerEntries).toHaveBeenCalledTimes(1);
  });

  it("still stores the taxable character rows of a mixed batch", async () => {
    vi.stubEnv("SINGLEPLAYER", "1");
    const db = mockDb();
    await emitTxBulk(
      db as never,
      [entry("corp_salary", "character"), entry("corp_revenue", "corporation")],
      DEFAULT_TX_THRESHOLDS
    );
    const [docs] = db.collectionMocks.financialTxLog.insertMany.mock.calls[0];
    expect(docs.map((d: FinancialTxLogEntry) => d.type)).toEqual(["corp_salary"]);
  });

  it("never lists a type that a mechanic or player screen reads back", () => {
    const read = [
      "corp_salary",
      "corp_dividend",
      "stock_trade_sell",
      "corp_capital_injection",
      "corp_tech_unlock",
      "bond_purchase",
      "bond_coupon",
      "bond_maturity",
    ];
    for (const type of read) {
      expect(SINGLEPLAYER_UNREAD_TX_TYPES.has(type as never), type).toBe(false);
    }
  });
});
