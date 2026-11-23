/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DebtCreditPanel } from "./DebtCreditPanel";

describe("DebtCreditPanel", () => {
  it("shows the average rate actually paid next to the new borrowing rate", () => {
    render(
      <DebtCreditPanel
        sym="$"
        principal={1000}
        interestRate={0.07}
        bookedRate={0.065}
        debtInterest={55}
        ceiling={2000}
        ceilingLabel="Ceiling"
        debtToGdp={1.3}
        rating="BB"
        trend={[]}
        trendRange=""
      />
    );
    expect(screen.getByText("Average rate paid")).toBeTruthy();
    expect(screen.getByText("5.50%")).toBeTruthy();
    expect(screen.getByText("New borrowing rate")).toBeTruthy();
    expect(screen.getByText("7.00%")).toBeTruthy();
  });

  it("names the smoothed GDP the debt ratio divides by and labels the sovereign rating", () => {
    render(
      <DebtCreditPanel
        sym="$"
        principal={1000}
        interestRate={0.07}
        ceiling={2000}
        ceilingLabel="Ceiling"
        debtToGdp={0.676}
        ratioGdp={1500}
        rating="BB"
        trend={[]}
        trendRange=""
      />
    );
    expect(screen.getByText(/of smoothed budget GDP/)).toBeTruthy();
    expect(screen.getByText("Debt-to-GDP").getAttribute("title")).toContain("not headline GDP");
    expect(screen.getByTitle(/Sovereign credit rating/).textContent).toBe("BB");
  });
});
