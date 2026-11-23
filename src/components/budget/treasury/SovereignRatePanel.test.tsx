/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  sovereignInputsFromFiscalClose,
  type SovereignFiscalClose,
} from "@/lib/budget/rules/sovereignInputs";
import { explainSovereignRate, type SovereignRateInputs } from "@/lib/budget/rules/sovereignRate";
import { SovereignRatePanel } from "./SovereignRatePanel";

const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`;

const current: SovereignRateInputs = {
  debtToGdpRatio: 0.9,
  primaryBalanceToGdp: 0.01,
  realGrowthPct: 2,
  inflationPct: 3,
  investorConfidence: 82,
  imfBailoutActive: false,
};

/** A close without booked interest cannot establish the primary balance. */
const partialClose: SovereignFiscalClose = {
  revenue: 105,
  spending: 100,
  gdp: 1_000,
  debtToGdp: 0.85,
  debtPrincipal: 850,
  gdpGrowth: 2,
  inflationRate: 3,
};

describe("SovereignRatePanel", () => {
  it("shows the current breakdown with no comparison when the prior close lacks the snapshot fields", () => {
    const previous = sovereignInputsFromFiscalClose(partialClose);
    expect(previous).toBeNull();

    render(<SovereignRatePanel current={current} previous={previous} />);

    const now = explainSovereignRate(current);
    expect(screen.getByText(`Debt-ratio ladder (${now.ladderRating} band)`)).toBeTruthy();
    expect(screen.getByText(pct(now.ladderRate))).toBeTruthy();
    expect(screen.getAllByText(pct(now.effectiveRate)).length).toBeGreaterThan(0);

    // Each of the four rows leaves its prior and change cells empty rather
    // than printing a delta against a close that never recorded one.
    expect(screen.getAllByText("n/a")).toHaveLength(4);
    expect(screen.queryAllByText(/pp$/)).toHaveLength(0);
    expect(screen.getByText("No prior close carried enough detail to break down.")).toBeTruthy();
  });

  it("compares against a prior close that did carry the snapshot fields", () => {
    const previous = sovereignInputsFromFiscalClose({
      ...partialClose,
      debtRate: 0.05,
      debtInterest: 30,
    });
    expect(previous).not.toBeNull();

    render(<SovereignRatePanel current={current} previous={previous} />);

    expect(screen.queryAllByText("n/a")).toHaveLength(0);
    expect(screen.queryAllByText(/pp$/).length).toBeGreaterThan(0);
    expect(screen.queryByText("No prior close carried enough detail to break down.")).toBeNull();
  });
});
