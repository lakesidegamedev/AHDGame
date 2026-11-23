/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DebtPathChart } from "./DebtPathChart";

const inputs = {
  debtToGdpRatio: 0.676,
  primaryBalanceToGdp: 0.074,
  realGrowthPct: 12.3,
  inflationPct: 1.2,
  investorConfidence: 1,
  imfBailoutActive: false,
};

describe("DebtPathChart", () => {
  it("states the inputs it projects from and labels both ends instead of a meaningless range", () => {
    render(
      <DebtPathChart
        inputs={inputs}
        countryId="CA"
        debtPrincipal={2.4e12}
        gdp={3.56e12}
        storedCeiling={2.8e12}
        fiscalYear={2029}
      />
    );
    const text = screen.getByText(/Inputs held for all 5 years/).textContent;
    expect(text).toContain("primary balance (before interest) 7.4% of GDP");
    expect(text).toContain("nominal growth 13.5% a year");
    expect(screen.getByText(/today 68%/)).toBeTruthy();
    expect(screen.queryByText(/% to \d+%/)).toBeNull();
  });
});
