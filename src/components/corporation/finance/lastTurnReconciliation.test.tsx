/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LastTurnReconciliation, costChangeNote } from "./LastTurnReconciliation";
import { reconcileLastTurn } from "@/lib/corporations/rules/lastTurnReconciliation";

const fmt = (n: number) => `$${Math.round(n)}`;
const fmtSigned = (n: number) => `${n < 0 ? "-" : "+"}$${Math.abs(Math.round(n))}`;

describe("LastTurnReconciliation", () => {
  it("lists construction as a labelled cash line that closes the cash change", () => {
    const data = reconcileLastTurn(
      {
        turn: 125,
        revenue: 220_112,
        totalCosts: 208_389,
        previousCosts: 155_298,
        retained: 8_241,
        dividendPaid: 434,
        tax: 3_048,
        cashAfter: 3_328_227,
        cashBefore: 3_580_855,
      },
      [{ type: "corp_capacity_build", amount: -260_869 }]
    );
    render(<LastTurnReconciliation data={data} fmt={fmt} fmtSigned={fmtSigned} />);
    expect(screen.getByText("Construction spending")).toBeTruthy();
    expect(screen.getByText("-$260869")).toBeTruthy();
    expect(screen.getByText(/-\$252628 on the turn/)).toBeTruthy();
    expect(screen.getByText(/up 34% on the turn before/)).toBeTruthy();
    expect(screen.queryByText("Other movements, not itemised")).toBeNull();
  });
});

describe("cost drivers in the recorded section", () => {
  const breakdown = (wages: number) => ({
    wages,
    inputs: 100,
    maintenance: 50,
    managementOverhead: 0,
    freight: 0,
    budgets: 0,
    other: 0,
  });
  const base = {
    turn: 125,
    revenue: 1000,
    retained: 0,
    dividendPaid: 0,
    tax: 0,
    cashAfter: 1,
    cashBefore: 1,
  };

  it("names wages and headcount when categories were recorded", () => {
    const data = reconcileLastTurn(
      {
        ...base,
        totalCosts: 250,
        previousCosts: 200,
        costBreakdown: breakdown(100),
        previousCostBreakdown: breakdown(50),
        headcount: 2070,
        previousHeadcount: 1505,
      },
      []
    );
    render(<LastTurnReconciliation data={data} fmt={fmt} fmtSigned={fmtSigned} />);
    expect(screen.getByText("Wages up 100%, headcount 1,505 to 2,070")).toBeTruthy();
  });

  it("says only the total is known on older rows", () => {
    const data = reconcileLastTurn({ ...base, totalCosts: 250, previousCosts: 200 }, []);
    render(<LastTurnReconciliation data={data} fmt={fmt} fmtSigned={fmtSigned} />);
    expect(screen.getByText(/not recorded for one of these turns/)).toBeTruthy();
  });
});

describe("costChangeNote", () => {
  it("stays quiet for small moves and unknown history", () => {
    expect(costChangeNote(105, 100)).toBeUndefined();
    expect(costChangeNote(100, null)).toBeUndefined();
  });
});
