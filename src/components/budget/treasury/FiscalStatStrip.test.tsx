/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FiscalStatStrip } from "./FiscalStatStrip";

const base = {
  sym: "₽",
  revenue: 1_000_000,
  spending: 900_000,
  gdp: 50_000_000,
  debtToGdp: 0.4,
  debtPrincipal: 25_000_000,
  rating: "AAA" as const,
  treasuryReserve: 100_000,
};

describe("FiscalStatStrip GDP tile", () => {
  it("labels the growth figure as a fiscal-year assumption, not a live rate", () => {
    render(<FiscalStatStrip {...base} gdpGrowth={2.276} />);
    // The live USSR case: the budget page carried +2.276% (a turn-39 rollover
    // snapshot) while the Economy page showed -0.436%. Unlabelled, the two read
    // as a contradiction.
    expect(screen.getByText(/\+2\.3% FY assumption/)).toBeTruthy();
    expect(screen.queryByText(/\+2\.3% growth$/)).toBeNull();
  });

  it("explains in the tooltip that it does not move between rollovers", () => {
    render(<FiscalStatStrip {...base} gdpGrowth={-5.443} />);
    const title = screen.getByText(/-5\.4% FY assumption/).getAttribute("title") ?? "";
    expect(title).toContain("fixed at the last rollover");
    expect(title).toContain("Economy page");
  });

  it("keeps the era-dollar note alongside the assumption label", () => {
    render(<FiscalStatStrip {...base} gdpGrowth={1.5} toUsd={(n) => n / 4} />);
    expect(screen.getByText(/\+1\.5% FY assumption · ≈ \$/)).toBeTruthy();
  });
});

describe("FiscalStatStrip sovereign debt", () => {
  it("shows outstanding bond principal and explains the debt ratio calculation", () => {
    render(<FiscalStatStrip {...base} gdpGrowth={2} />);

    expect(screen.getByText("Outstanding bond principal")).toBeTruthy();
    expect(screen.getByText("₽25.0M")).toBeTruthy();
    expect(screen.getByText("Debt-to-GDP").getAttribute("title")).toContain(
      "smoothed national GDP"
    );
    expect(screen.getByText("Debt-to-GDP").getAttribute("title")).toContain(
      "not part of the numerator"
    );
  });

  it("shows the GDP used for the ratios when a separate GDP figure is on screen", () => {
    render(<FiscalStatStrip {...base} gdpGrowth={2} ratioGdp={40_000_000} />);

    expect(screen.getByText("₽50.0M")).toBeTruthy();
    expect(screen.getByText("of smoothed budget GDP ₽40.0M")).toBeTruthy();
    expect(screen.getByText("0.3% of budget GDP")).toBeTruthy();
  });
});

describe("FiscalStatStrip GDP compare", () => {
  it("states the change against the prior close in percent so it is not read as the growth assumption", () => {
    render(
      <FiscalStatStrip
        sym="$"
        revenue={1}
        spending={1}
        gdp={38.67e12}
        gdpGrowth={9.394}
        debtToGdp={1}
        debtPrincipal={1}
        rating="BB"
        treasuryReserve={0}
        compare
        prev={{ fy: 2028, revenue: 1, spending: 1, debtToGdp: 1, gdp: 33.277e12 } as never}
      />
    );
    expect(screen.getByText(/\+16\.2% since FY2028 close/)).toBeTruthy();
    expect(screen.getByText(/\+9\.4% FY assumption/)).toBeTruthy();
  });

  it("labels the credit rating as the sovereign rating and names its basis", () => {
    render(<FiscalStatStrip {...base} gdpGrowth={2} />);
    expect(screen.getByText("Sovereign, from debt-to-GDP")).toBeTruthy();
    expect(screen.getByText("Credit rating").getAttribute("title")).toContain("bond pages");
  });
});
