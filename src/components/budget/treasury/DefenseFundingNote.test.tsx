/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DefenseFundingNote } from "./DefenseFundingNote";
import type { DefenseFundingPosition } from "@/lib/publicFinance/queries/defenseFunding";

const funded: DefenseFundingPosition = {
  lineAnnual: 48_000_000,
  accrualPerTurn: 1_000_000,
  upkeepPerTurn: 550_000,
  shortfallPerTurn: 0,
  treasuryDrawPerTurn: 0,
  potChangePerTurn: 450_000,
  potBalance: 2_000_000,
  arrearsRatio: 0,
  unitCount: 10,
};

const overdrawn: DefenseFundingPosition = {
  lineAnnual: 34_570_712_273,
  accrualPerTurn: 720_223_172,
  upkeepPerTurn: 1_211_274_865,
  shortfallPerTurn: 491_051_693,
  treasuryDrawPerTurn: 491_051_693,
  potChangePerTurn: -491_051_693,
  potBalance: -6_464_629_934,
  arrearsRatio: 0,
  unitCount: 22,
};

describe("DefenseFundingNote (ticket #1269)", () => {
  it("shows upkeep covered by the line with no shortfall", () => {
    render(<DefenseFundingNote sym="M" funding={funded} />);
    expect(screen.getByText("Defence funding")).toBeTruthy();
    expect(screen.getByText(/no overdraft drawn/)).toBeTruthy();
    expect(screen.getByText(/rises when the line exceeds upkeep/)).toBeTruthy();
  });

  it("names the beyond-the-line draw that the surplus tile misses", () => {
    render(<DefenseFundingNote sym="M" funding={overdrawn} />);
    // Per-turn bleed, compact billions.
    expect(screen.getByText("M491.1M")).toBeTruthy();
    // Cumulative position.
    expect(screen.getByText("-M6.5B")).toBeTruthy();
    expect(screen.getByText(/Overdrawn/)).toBeTruthy();
    // The reconciliation sentence: why the treasury can fall under a surplus.
    expect(screen.getByText(/do not appear in spending/)).toBeTruthy();
  });

  it("tells an overdrawn reader when new debt is added and how to shrink it (issue #1753)", () => {
    render(<DefenseFundingNote sym="M" funding={overdrawn} />);
    expect(screen.getByText(/running total of past shortfalls/)).toBeTruthy();
    expect(
      screen.getByText(/new draw is added only when closing debt exceeds the opening debt/)
    ).toBeTruthy();
    expect(screen.getByText(/appropriate more or field less/)).toBeTruthy();
    expect(screen.getByText(/covered turns pay it down/)).toBeTruthy();
  });

  it("surfaces the per-turn SOE backing next to the defence shortfall (issue #1754)", () => {
    render(<DefenseFundingNote sym="M" funding={overdrawn} soeNetPerTurn={-2_000_000_000} />);
    expect(screen.getByText("State enterprise backing per turn")).toBeTruthy();
    expect(screen.getByText("M2.0B")).toBeTruthy();
    // Footer totals both hidden draws: M491.1M + M2.0B = M2.5B. Footer figures
    // are bare text nodes, so assert on the paragraph content, not getByText.
    const check = screen.getByText(/Treasury check/);
    expect(check.textContent).toContain(
      "M491.1M new defence debt beyond the defence line plus M2.0B state enterprise backing"
    );
    expect(check.textContent).toContain("M2.5B");
  });

  it("omits the enterprise tile when SOEs remit a profit", () => {
    render(<DefenseFundingNote sym="M" funding={overdrawn} soeNetPerTurn={5_000_000} />);
    expect(screen.queryByText("State enterprise backing per turn")).toBeNull();
    const check = screen.getByText(/Treasury check/);
    expect(check.textContent).toContain("beyond the defence line");
    expect(check.textContent).not.toContain("enterprise backing");
  });

  it("says so when there are no hidden draws", () => {
    render(<DefenseFundingNote sym="M" funding={funded} soeNetPerTurn={1_000_000} />);
    expect(screen.getByText(/no new defence debt is drawn/)).toBeTruthy();
  });

  it("flags an unknown enterprise figure instead of asserting zero", () => {
    render(<DefenseFundingNote sym="M" funding={overdrawn} soeNetPerTurn={null} />);
    expect(screen.queryByText("State enterprise backing per turn")).toBeNull();
    expect(screen.getByText(/not shown here/)).toBeTruthy();
  });

  it("surfaces recurring international organization contributions", () => {
    render(
      <DefenseFundingNote
        sym="M"
        funding={funded}
        organizationContributions={{
          perTurn: 2_000_000_000,
          lines: [
            { organizationId: "COMECON", kind: "dues", perTurn: 1_000_000_000 },
            { organizationId: "WARSAW_PACT", kind: "dues", perTurn: 1_000_000_000 },
          ],
        }}
      />
    );
    expect(screen.getByText("International organization contributions per turn")).toBeTruthy();
    expect(screen.getByText("M2.00B")).toBeTruthy();
    expect(screen.getByText("COMECON dues: M1.00B")).toBeTruthy();
    expect(screen.getByText("WARSAW PACT dues: M1.00B")).toBeTruthy();
    const check = screen.getByText(/Treasury check/);
    expect(check.textContent).toContain("M2.0B international organization contributions");
    expect(check.textContent).toContain("surplus reads high by M2.0B");
  });
});

describe("DefenseFundingNote deficit and dues labelling", () => {
  const funding = {
    lineAnnual: 480,
    accrualPerTurn: 10,
    upkeepPerTurn: 5,
    shortfallPerTurn: 0,
    treasuryDrawPerTurn: 0,
    potChangePerTurn: 5,
    potBalance: 100,
    arrearsRatio: 0,
    unitCount: 3,
  } as never;

  it("labels the draw as defence only and shows the whole-budget deficit", () => {
    render(<DefenseFundingNote sym="$" funding={funding} budgetBalancePerTurn={-133.3e9} />);
    expect(screen.getByText("New defence debt per turn")).toBeTruthy();
    expect(screen.getByText("Whole-budget deficit per turn")).toBeTruthy();
    expect(screen.getByText("$133.3B")).toBeTruthy();
  });

  it("lists dues by display name at two decimals so lines add up to the total", () => {
    render(
      <DefenseFundingNote
        sym="C$"
        funding={funding}
        organizationContributions={{
          perTurn: 9_671_860,
          lines: [
            { organizationId: "UN", organizationName: "UN", kind: "dues", perTurn: 4_835_930 },
            { organizationId: "orc", organizationName: "Orcish Concord", kind: "dues", perTurn: 4_835_930 },
          ],
        }}
      />
    );
    expect(screen.getByText(/Orcish Concord dues: C\$4\.84M/)).toBeTruthy();
    expect(screen.getByText("C$9.67M")).toBeTruthy();
  });
});
