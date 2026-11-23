import { describe, expect, it } from "vitest";
import { groupCashFlowLines, reconcileLastTurn } from "./lastTurnReconciliation";

describe("groupCashFlowLines", () => {
  it("nets construction spending and refunds into one labelled line", () => {
    const lines = groupCashFlowLines([
      { type: "corp_capacity_build", amount: -82_234 },
      { type: "corp_capacity_build", amount: -57_561 },
      { type: "corp_capacity_build_refund", amount: 1_000 },
    ]);
    expect(lines).toEqual([
      { key: "construction", label: "Construction spending", amount: -138_795 },
    ]);
  });

  it("drops movements already booked in the income statement", () => {
    expect(
      groupCashFlowLines([
        { type: "corp_tax_paid", amount: -9_851 },
        { type: "corp_dividend", amount: -9_500 },
        { type: "producer_market_settlement", amount: 18_092 },
      ])
    ).toEqual([]);
  });

  it("keeps an unlabelled type visible instead of dropping it", () => {
    expect(groupCashFlowLines([{ type: "some_new_type", amount: -5 }])).toEqual([
      { key: "other_logged", label: "Other logged movements", amount: -5 },
    ]);
  });

  it("itemises a research unlock, share and bond movements and received dividends", () => {
    const lines = groupCashFlowLines([
      { type: "corp_tech_unlock", amount: -686_668 },
      { type: "corp_starting_grant", amount: 5_000 },
      { type: "bond_default", amount: 40 },
      { type: "corp_dividend", amount: 1_200 },
      { type: "corp_dividend", amount: -900 },
    ]);
    expect(lines.map((l) => l.key).sort()).toEqual(
      ["bond_repay", "capital", "dividends_received", "tech"].sort()
    );
    expect(lines.find((l) => l.key === "tech")?.amount).toBe(-686_668);
    expect(lines.find((l) => l.key === "dividends_received")?.amount).toBe(1_200);
  });

  it("shows a staff adjustment as its own line", () => {
    const lines = groupCashFlowLines([{ type: "restitution_credit", amount: 120 }]);
    expect(lines[0]?.label).toBe("Staff adjustments");
  });
});

describe("reconcileLastTurn", () => {
  const recorded = {
    turn: 125,
    revenue: 220_112,
    totalCosts: 208_389,
    retained: 8_241,
    dividendPaid: 434,
    tax: 3_048,
    cashAfter: 3_328_227,
    cashBefore: 3_580_855,
  };

  it("ties cash change to retained income plus labelled lines to the dollar", () => {
    const r = reconcileLastTurn(recorded, [{ type: "corp_capacity_build", amount: -260_869 }]);
    expect(r.cash.change).toBe(-252_628);
    expect(r.cash.unitemised).toBe(0);
    const total =
      r.cash.retained + r.cash.lines.reduce((s, l) => s + l.amount, 0) + (r.cash.unitemised ?? 0);
    expect(total).toBe(r.cash.change);
  });

  it("surfaces whatever is left as an unitemised line", () => {
    const r = reconcileLastTurn(recorded, []);
    expect(r.cash.unitemised).toBe(-260_869);
  });

  it("splits the recorded statement so every part adds back to revenue", () => {
    const { statement } = reconcileLastTurn(recorded, []);
    expect(statement.otherNet).toBe(0);
    expect(
      statement.costs +
        statement.tax -
        statement.otherNet +
        statement.dividendPaid +
        statement.retained
    ).toBe(statement.revenue);
  });

  it("leaves the cash change unknown without an opening balance", () => {
    const r = reconcileLastTurn({ ...recorded, cashBefore: null }, []);
    expect(r.cash.change).toBeNull();
    expect(r.cash.unitemised).toBeNull();
  });

  it("signs the gap between operating result and retained income as it moves retained income", () => {
    const r = reconcileLastTurn(
      { ...recorded, retained: 7_041, bondInterestPaid: 900, bondCouponIncome: 100 },
      []
    );
    // 220,112 - 208,389 - 3,048 - 434 = 8,241 before the gap; retained is 1,200 lower.
    expect(r.statement.otherNet).toBe(-1_200);
    expect(r.statement.otherParts.map((p) => p.amount)).toEqual([-900, 100]);
    expect(r.statement.otherUnitemised).toBe(-400);
    const foot =
      r.statement.revenue -
      r.statement.costs -
      r.statement.tax -
      r.statement.dividendPaid +
      r.statement.otherNet;
    expect(foot).toBe(r.statement.retained);
  });

  it("reports cash now only when it differs from the recorded end cash", () => {
    expect(reconcileLastTurn({ ...recorded, cashNow: recorded.cashAfter }, []).cash.now).toBeNull();
    expect(reconcileLastTurn({ ...recorded, cashNow: 2_641_559 }, []).cash.now).toBe(2_641_559);
  });
});
