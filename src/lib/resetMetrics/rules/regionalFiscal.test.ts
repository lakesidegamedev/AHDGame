import { describe, expect, it } from "vitest";
import { evaluateResetApprovalModifiers } from "./approval";
import {
  LEDGER_FISCAL_METRIC_IDS,
  onlyLedgerFiscal,
  regionalFiscalObservations,
  withoutLedgerFiscal,
} from "./regionalFiscal";
import type { OpeningMetricObservation } from "./openingObservation";

const reading = (metricId: string, path: string, value: number): OpeningMetricObservation => ({
  metricId,
  path,
  value,
  status: "derived",
  source: "test",
  owner: "ledger",
  note: "",
});
// The live federal position from ticket 1892: an 18% deficit and 132% debt.
const federal = {
  "09": reading("09", "governance.budgetBalance", -18.4),
  "10": reading("10", "governance.debtToGdp", 131.9),
};
const ids = (observations: Record<string, OpeningMetricObservation>) =>
  evaluateResetApprovalModifiers(observations, { countryId: "US", year: 2027 }).map((m) => m.id);

describe("regional fiscal approval conditions", () => {
  it("covers exactly the treasury fiscal balance and debt", () => {
    expect([...LEDGER_FISCAL_METRIC_IDS].sort()).toEqual(["09", "10"]);
  });

  it("does not charge a solvent state for the national treasury's deficit and debt", () => {
    // Texas: no borrowing and a 56.7 billion surplus on 3.68 trillion of output.
    const own = regionalFiscalObservations({ surplus: 56.7e9, principal: 0, gdp: 3.683e12 });
    const active = ids({ ...withoutLedgerFiscal(federal), ...own });
    expect(active).not.toContain("government_deficit");
    expect(active).not.toContain("fiscal_crisis");
    expect(active).not.toContain("heavy_public_debt");
    expect(active).toContain("balanced_budget");
    expect(active).toContain("fiscal_discipline");
  });

  it("still charges a state for its own deficit and debt", () => {
    const own = regionalFiscalObservations({ surplus: -6e9, principal: 120e9, gdp: 100e9 });
    const active = ids({ ...withoutLedgerFiscal(federal), ...own });
    expect(active).toEqual(
      expect.arrayContaining(["government_deficit", "fiscal_crisis", "heavy_public_debt"])
    );
  });

  it("keeps the treasury's conditions for national approval", () => {
    expect(ids(onlyLedgerFiscal(federal))).toEqual(
      expect.arrayContaining(["government_deficit", "fiscal_crisis", "heavy_public_debt"])
    );
  });

  it("fires no fiscal condition for a region with no budget or output", () => {
    expect(regionalFiscalObservations(undefined)).toEqual({});
    expect(regionalFiscalObservations({ surplus: -5, principal: 0, gdp: 0 })).toEqual({});
  });
});
