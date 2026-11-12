/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SovereignProjection } from "@/lib/publicFinance/queries/federalBudgetDetail";
import { SovereignHealthPanel } from "./SovereignHealthPanel";

const warningSovereign: SovereignProjection = {
  state: "normal",
  demandRatio: 1.983,
  failedAuctions: 0,
  marketAccess: "Open",
  marketAccessUntilTurn: null,
  ceilingUseRatio: 0.892,
  ceilingHeadroom: 12_955_142_605,
  ceilingHeadroomYears: 1.53,
  ceilingStatus: "warning",
  consolidation: null,
};

describe("SovereignHealthPanel ceiling signal", () => {
  it("shows a public warning when effective borrowing headroom is short", () => {
    render(<SovereignHealthPanel sym="M" sovereign={warningSovereign} />);

    expect(screen.getByText("Debt ceiling warning")).toBeTruthy();
    expect(screen.getByText(/89% of the effective limit is used/)).toBeTruthy();
    expect(screen.getByText(/1.5 years/)).toBeTruthy();
  });
});

describe("SovereignHealthPanel austerity package", () => {
  it("shows the package size, split and approval cost", () => {
    render(
      <SovereignHealthPanel
        sym="M"
        sovereign={{
          ...warningSovereign,
          consolidation: {
            fiscalYear: 2031,
            sizeGdpShare: 0.0362,
            taxShare: 0.4,
            cutShare: 0.6,
            approvalCost: 5.4,
            approvalEffectNow: 2.7,
            turnsRemaining: 24,
          },
        }}
      />
    );
    const box = screen.getByTestId("consolidation-package");
    expect(box.textContent).toContain("fiscal year 2031");
    expect(box.textContent).toContain("3.6% of GDP");
    expect(box.textContent).toContain("40% from tax rises and 60% from spending cuts");
    expect(box.textContent).toContain("5.4 points of approval");
    expect(box.textContent).toContain("2.7 points are still being felt");
  });

  it("shows nothing when there is no recent package", () => {
    render(<SovereignHealthPanel sym="M" sovereign={warningSovereign} />);
    expect(screen.queryByTestId("consolidation-package")).toBeNull();
  });
});
