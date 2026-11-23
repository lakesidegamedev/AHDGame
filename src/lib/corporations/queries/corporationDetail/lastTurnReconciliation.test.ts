import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { loadLastTurnReconciliation } from "./lastTurnReconciliation";

function fixture(overrides: Record<string, unknown> = {}) {
  const id = new ObjectId();
  const latest = {
    turn: 10,
    revenue: 2000,
    totalCosts: 1000,
    income: 800,
    corporateTaxPaid: 200,
    liquidCapital: 1000740,
    currencyCode: "USD",
    fxRateAtWrite: 2,
    perTurnBondCouponIncome: 30,
    perTurnBondDragOnNetIncome: 100,
    dividendIncomeReceived: 10,
    cashSnapshotAt: new Date("2030-01-01T11:12:00Z"),
    ...overrides,
  };
  const previous = {
    liquidCapital: 1000000,
    currencyCode: "USD",
    cashSnapshotAt: new Date("2030-01-01T10:12:00Z"),
  };
  const findOne = vi.fn().mockResolvedValueOnce(latest).mockResolvedValueOnce(previous);
  const aggregate = vi.fn().mockReturnValue({ toArray: async () => [] });
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "corporationHistory") return { findOne };
      if (name === "financialTxLog") return { aggregate };
      throw Error("Unexpected database access");
    }),
  } as unknown as Db;
  return { id, db, aggregate, findOne };
}

describe("last-turn evidence loader", () => {
  it("reconciles bond flows and received dividends once in native historical currency", async () => {
    const { id, db, aggregate, findOne } = fixture();
    const r = await loadLastTurnReconciliation(db, { _id: id });
    expect(r?.cash.retained).toBe(740);
    expect(r?.cash.unitemised).toBe(0);
    expect(r?.statement.otherParts).toEqual(
      expect.arrayContaining([
        { key: "bond_interest", label: "Interest paid on bonds issued", amount: -100 },
        { key: "bond_coupons", label: "Coupons received on bonds held", amount: 30 },
        { key: "dividends_received", label: "Dividends received on shares held", amount: 10 },
      ])
    );
    expect(r?.statement.otherUnitemised).toBe(0);
    expect(r?.cash.evidence).toEqual({ boundary: "recorded", unconvertedMovements: 0 });
    expect(findOne.mock.calls[0][1].projection.dividendIncomeReceived).toBe(1);
    expect(aggregate.mock.calls[0][0]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ $limit: expect.anything() })])
    );
  });
  it("uses all grouped rows beyond 500, including mixed-currency cash movements", async () => {
    const { id, db, aggregate } = fixture({ liquidCapital: 999940 });
    aggregate.mockReturnValue({
      toArray: async () => [
        {
          _id: { type: "corp_capacity_build", currencyCode: "CAD" },
          amount: -1000,
          anchorAmount: -400,
          count: 750,
          missingAnchor: 0,
        },
      ],
    });
    const r = await loadLastTurnReconciliation(db, { _id: id });
    expect(r?.cash.lines[0].amount).toBe(-800);
    expect(r?.cash.unitemised).toBe(0);
    const match = aggregate.mock.calls[0][0][0].$match;
    expect(match.createdAt.$lte).toEqual(new Date("2030-01-01T11:12:00Z"));
  });
  it("retains a visible evidence warning for unknown conversion", async () => {
    const { id, db, aggregate } = fixture();
    aggregate.mockReturnValue({
      toArray: async () => [
        {
          _id: { type: "corp_capacity_build", currencyCode: "CAD" },
          amount: -100,
          anchorAmount: 0,
          count: 3,
          missingAnchor: 3,
        },
      ],
    });
    const r = await loadLastTurnReconciliation(db, { _id: id });
    expect(r?.cash.evidence?.unconvertedMovements).toBe(3);
  });
});
