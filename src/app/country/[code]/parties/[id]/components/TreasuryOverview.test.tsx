/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TreasuryOverview } from "./TreasuryOverview";
import type { PartyData } from "./types";

afterEach(cleanup);

const party = {
  treasury: 5_000_000,
  countryId: "US",
  nationalTaxRate: 10,
  expectedHourlyIncome: 1_000_000,
  gotvBudgetPercent: 10,
  gotvEstimatedSpend: 100_000,
  gotvTargetCategory: null,
  gotvTargetGroup: null,
  suppressionBudgetPercent: 0,
  suppressionEstimatedSpend: 0,
  suppressionTargetCategory: null,
  suppressionTargetGroup: null,
  registrationBudgetPercent: 12,
  registrationEstimatedSpend: 123_845,
  psInvestmentBudget: 250_000,
  psInvestmentEstimatedSpend: 250_000,
  politicalStrength: 10,
  effectivePsCap: 100,
  netHourlyTreasuryChange: 526_155,
} as unknown as PartyData;

describe("treasury overview", () => {
  it("shows each spending line at its own settled amount", () => {
    const { container } = render(
      <TreasuryOverview
        party={party}
        countryId="US"
        isInParty
        isAdmin={false}
        netIncome={party.netHourlyTreasuryChange}
        totalSpending={473_845}
        revenue={party.expectedHourlyIncome}
        gotvPct={10}
        supPct={0}
        regPct={12.3845}
        psPct={25}
        psSpend={party.psInvestmentEstimatedSpend}
        netPct={52.6}
      />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Voter registration spending / hr");
    expect(text).toContain("-$123,845");
    expect(text).toContain("-$250,000");
    expect(text).not.toContain("373,845");
  });
});
