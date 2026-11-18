import { describe, expect, it } from "vitest";
import {
  sovereignInputsFromBudget,
  sovereignInputsFromFiscalClose,
  type SovereignBudgetFields,
} from "./sovereignInputs";

function budget(overrides: Partial<SovereignBudgetFields> = {}): SovereignBudgetFields {
  return {
    revenue: { total: 120 },
    // `spending.total` carries the interest bill, so the primary balance adds
    // it back: 120 - 110 + 500 * 0.05 = 35.
    spending: { total: 110 },
    gdp: 1_000,
    debt: { principal: 500, interestRate: 0.05 },
    economicFactors: { gdpGrowth: 2, inflationRate: 3 },
    investorConfidence: 82,
    imfSovereignBailoutActive: false,
    ...overrides,
  };
}

describe("sovereignInputsFromBudget", () => {
  it("adds the interest bill back to reach the primary balance", () => {
    const inputs = sovereignInputsFromBudget(budget());

    expect(inputs.primaryBalanceToGdp).toBeCloseTo(0.035, 10);
  });

  it("keeps the stored ratio the debt panel shows", () => {
    const inputs = sovereignInputsFromBudget(budget({ debtToGdpRatio: 0.55, gdpSmoothed: 2_000 }));

    expect(inputs.debtToGdpRatio).toBe(0.55);
  });

  it("falls back to the stock over the ratio GDP", () => {
    expect(sovereignInputsFromBudget(budget()).debtToGdpRatio).toBeCloseTo(0.5, 10);
    expect(sovereignInputsFromBudget(budget({ gdpSmoothed: 2_000 })).debtToGdpRatio).toBeCloseTo(
      0.25,
      10
    );
  });

  it("uses the smoothed GDP as the primary balance denominator", () => {
    const inputs = sovereignInputsFromBudget(budget({ gdpSmoothed: 2_000 }));

    expect(inputs.primaryBalanceToGdp).toBeCloseTo(0.0175, 10);
  });

  it("reports zero ratios rather than Infinity when there is no GDP", () => {
    const inputs = sovereignInputsFromBudget(budget({ gdp: 0, gdpSmoothed: 0 }));

    expect(inputs.debtToGdpRatio).toBe(0);
    expect(inputs.primaryBalanceToGdp).toBe(0);
  });

  it("keeps a stored ratio when there is no GDP to divide by", () => {
    const inputs = sovereignInputsFromBudget(
      budget({ gdp: 0, gdpSmoothed: 0, debtToGdpRatio: 0.4 })
    );

    expect(inputs.debtToGdpRatio).toBe(0.4);
    expect(inputs.primaryBalanceToGdp).toBe(0);
  });

  it("carries the growth, confidence and programme inputs unchanged", () => {
    const inputs = sovereignInputsFromBudget(
      budget({ investorConfidence: 40, imfSovereignBailoutActive: true })
    );

    expect(inputs.realGrowthPct).toBe(2);
    expect(inputs.inflationPct).toBe(3);
    expect(inputs.investorConfidence).toBe(40);
    expect(inputs.imfBailoutActive).toBe(true);
  });

  it("treats a missing interest rate as no interest bill", () => {
    const inputs = sovereignInputsFromBudget(budget({ debt: { principal: 500 } }));

    expect(inputs.primaryBalanceToGdp).toBeCloseTo(0.01, 10);
  });
});

describe("sovereignInputsFromFiscalClose", () => {
  const close = {
    revenue: 105,
    spending: 100,
    gdp: 1_000,
    debtToGdp: 0.9,
    debtPrincipal: 800,
    debtRate: 0.06,
    gdpGrowth: 2,
    inflationRate: 3,
  };

  it("derives the close's primary balance from its own totals", () => {
    const inputs = sovereignInputsFromFiscalClose(close);

    expect(inputs?.debtToGdpRatio).toBe(0.9);
    expect(inputs?.primaryBalanceToGdp).toBeCloseTo(0.053, 10);
    expect(inputs?.realGrowthPct).toBe(2);
  });

  it("returns null when the close did not record its rate or growth", () => {
    expect(sovereignInputsFromFiscalClose(null)).toBeNull();
    expect(sovereignInputsFromFiscalClose({ ...close, debtRate: undefined })).toBeNull();
    expect(sovereignInputsFromFiscalClose({ ...close, gdpGrowth: undefined })).toBeNull();
    expect(sovereignInputsFromFiscalClose({ ...close, inflationRate: undefined })).toBeNull();
    expect(sovereignInputsFromFiscalClose({ ...close, gdp: 0 })).toBeNull();
  });
});
