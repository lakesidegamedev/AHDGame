import { describe, it, expect } from "vitest";
import { modeledHouseholdFixture } from "../testing/modeledHouseholdFixture";
import { modelHouseholdIncome } from "./modelHouseholdIncome";
import { produceHouseholdSource } from "./produceHouseholdSource";
import { householdPublication } from "./householdPublication";

describe("modeled earnings and enacted taxes, with actual funded benefits", () => {
  it("reevaluates reviewed means tests against current modeled earnings", () => {
    const f = modeledHouseholdFixture();
    f.model.programRoles = f.model.programRoles.map((r) => ({
      ...r,
      eligibilityModel: {
        kind: "maximum-modeled-market-income",
        annualPerAssessmentUnit: 30,
        indexedToPrices: true,
      },
    }));
    expect(
      modelHouseholdIncome(f).current!.programRoles[0]!.recipients!.find((r) => r.id === "low")!
        .eligibility
    ).toBe(1);
    f.activity = f.activity.map((r) => ({ ...r, output: r.output * 2 }));
    expect(
      modelHouseholdIncome(f).current!.programRoles[0]!.recipients!.find((r) => r.id === "low")!
        .eligibility
    ).toBe(0);
    f.activity = f.activity.map((r) => ({ ...r, output: r.output / 2, costOfLiving: 200 }));
    expect(
      modelHouseholdIncome(f).current!.programRoles[0]!.recipients!.find((r) => r.id === "low")!
        .eligibility
    ).toBe(1);
  });
  it("does not silently treat historical recipient weights as a current eligibility rule", () => {
    const f = modeledHouseholdFixture();
    f.model.programRoles = f.model.programRoles.map((r) => ({ ...r, eligibilityModel: undefined }));
    expect(modelHouseholdIncome(f).gaps).toContain("missing-reviewed-benefit-eligibility-model");
  });
  it("uses the same midpoint convention as the household owner for an exact weighted median tie", () => {
    const f = modeledHouseholdFixture();
    f.reference.cells = f.reference.cells.filter((c) => c.id !== "middle");
    f.model.programRoles = f.model.programRoles.map((r) => ({
      ...r,
      recipients: r.recipients?.filter((c) => c.id !== "middle"),
    }));
    f.model.regions = f.model.regions.map((r) => ({ ...r, population: 2 }));
    f.activity = f.activity.map((r) => ({ ...r, population: 2 }));
    Object.assign(f.nationalTaxes, { incomeTaxLow: 0, incomeTaxMiddle: 20, incomeTaxHigh: 40 });
    const r = modelHouseholdIncome(f);
    expect(r.current!.cells.find((c) => c.id === "high")!.directTaxes).toBe(40);
  });
  it("requires controls of the model basis and never substitutes a budget forecast", () => {
    const f = modeledHouseholdFixture();
    const r = modelHouseholdIncome(f);
    expect(produceHouseholdSource({ ...f, ...r, fiscalControls: undefined }).gaps).toContain(
      "missing-modeled-household-controls"
    );
    r.fiscalControls!.basis = "budget-forecast";
    expect(produceHouseholdSource({ ...f, ...r }).gaps).toContain(
      "missing-modeled-household-controls"
    );
  });
  it("retains minor-only households without inventing adult residents", () => {
    const f = modeledHouseholdFixture();
    f.reference.cells = f.reference.cells.map((c) => ({ ...c, adults: 0, children: 1 }));
    const r = modelHouseholdIncome(f);
    expect(r.gaps).toEqual([]);
    expect(r.current!.cells.every((c) => c.adults === 0 && c.children === 1)).toBe(true);
  });
  it("does not silently zero a missing tier or an unmodeled property levy", () => {
    const f = modeledHouseholdFixture();
    const missing = modelHouseholdIncome({
      ...f,
      nationalTaxes: { incomeTaxLow: 5, payrollTax: 0 },
    });
    expect(missing.gaps).toContain("missing-current-income-tax-rates");
    f.activity = f.activity.map((r) => ({ ...r, regionalTaxes: { incomeTax: 0, propertyTax: 1 } }));
    expect(modelHouseholdIncome(f).gaps).toContain("unmodeled-current-property-levy");
  });
  it("replaces historical tax estimates rather than requiring them to be current cash receipts", () => {
    const f = modeledHouseholdFixture();
    f.reference.gaps = [
      "estimated-tax-liabilities-not-cash",
      "tax-credits-and-filing-units-not-resolved",
    ];
    f.reference.cells = f.reference.cells.map((c) => ({
      ...c,
      directTaxes: null,
      employeeContributions: null,
    }));
    const result = modelHouseholdIncome(f);
    expect(produceHouseholdSource({ ...f, ...result }).path).toBe("produced");
  });
  it("does not charge the employer incidence to household disposable income", () => {
    const f = modeledHouseholdFixture();
    f.model.employeePayrollShare = 0.5;
    f.nationalTaxes.payrollTax = 10;
    const c = modelHouseholdIncome(f).current!.cells[0]!;
    expect(c.employeeContributions).toBeCloseTo(c.marketIncome * 0.05);
  });
  it("re-prices nominal earnings once when real output is unchanged", () => {
    const f = modeledHouseholdFixture();
    const before = modelHouseholdIncome(f);
    f.activity = f.activity.map((r) => ({ ...r, costOfLiving: 200 }));
    const after = modelHouseholdIncome(f);
    expect(after.fiscalControls!.annualMarketIncome).toBe(
      before.fiscalControls!.annualMarketIncome * 2
    );
    expect(after.current!.regions[0]!.consumerPriceIndex).toBe(200);
  });
  it.each(["US", "UK", "JP"] as const)(
    "produces a complete %s model without external income frames",
    (country) => {
      const f = modeledHouseholdFixture(country),
        before = structuredClone(f);
      const result = modelHouseholdIncome(f);
      expect(result.gaps).toEqual([]);
      expect(f).toEqual(before);
      expect(result.current!.incomeBasis).toBe("modeled-economic-income");
      expect(result.fiscalControls!.basis).toBe("modeled-household-flows");
      const produced = produceHouseholdSource({ ...f, ...result });
      expect(produced.path).toBe("produced");
      const readings = householdPublication({ ...f, source: produced.source });
      expect(readings.size).toBe(2);
      expect(readings.values().next().value!["03"]!.source).toContain("modeled");
    }
  );
  it("scales total earnings with output and weights with population, without double-counting employment", () => {
    const f = modeledHouseholdFixture();
    const before = modelHouseholdIncome(f);
    f.activity = f.activity.map((r) => ({
      ...r,
      output: r.output * 2,
      population: r.population * 2,
    }));
    const after = modelHouseholdIncome(f);
    expect(after.fiscalControls!.annualMarketIncome).toBe(
      before.fiscalControls!.annualMarketIncome * 2
    );
    expect(after.current!.cells[0]!.marketIncome).toBe(before.current!.cells[0]!.marketIncome);
    expect(after.current!.cells[0]!.households).toBe(before.current!.cells[0]!.households * 2);
  });
  it("uses enacted tiers, regional income/resident levies and payroll only on earned income", () => {
    const f = modeledHouseholdFixture("JP");
    f.nationalTaxes = { incomeTax: 20, payrollTax: 10 };
    f.activity = f.activity.map((r) => ({ ...r, regionalTaxes: { residentTax: 5 } }));
    f.reference.cells = f.reference.cells.map((c) => ({ ...c, labourIncome: c.marketIncome! / 2 }));
    const result = modelHouseholdIncome(f);
    const c = result.current!.cells[0]!;
    expect(c.directTaxes).toBeCloseTo(c.marketIncome * 0.25);
    expect(c.employeeContributions).toBeCloseTo(c.marketIncome * 0.05);
  });
  it("caps modeled deductions at resources and does not create cash or tax arrears", () => {
    const f = modeledHouseholdFixture();
    f.nationalTaxes = { incomeTax: 100, payrollTax: 100 };
    const r = modelHouseholdIncome(f);
    expect(
      r.current!.cells.every((c) => c.directTaxes + c.employeeContributions <= c.marketIncome)
    ).toBe(true);
  });
  it("never retains historical survey benefits when funding is zero", () => {
    const f = modeledHouseholdFixture();
    f.settlements.get("cash-law")!.outlaid = 0;
    const produced = produceHouseholdSource({ ...f, ...modelHouseholdIncome(f) });
    expect(produced.path).toBe("produced");
    expect(produced.source!.coverage.reconciliation!.paidCashTransfers).toBe(0);
  });
  it.each([
    "population",
    "distribution",
    "taxes",
    "calibration",
    "world",
    "geography",
    "output",
    "other-tax",
    "payroll-base",
  ])("keeps incomplete %s on legacy", (missing) => {
    const f = modeledHouseholdFixture();
    if (missing === "population") f.reference.population = "multi-person-only";
    if (missing === "distribution") f.reference.distribution = "marginal-means";
    if (missing === "taxes")
      f.activity = f.activity.map((r) => ({ ...r, regionalTaxes: undefined }));
    if (missing === "calibration") f.model.year = 1990;
    if (missing === "world") f.model.worldId = "wrong";
    if (missing === "geography")
      f.model.regions = f.model.regions.map((r) => ({ ...r, sourceAreas: ["same"] }));
    if (missing === "output") f.activity[0]!.output = NaN;
    if (missing === "other-tax")
      f.reference.cells = f.reference.cells.map((c) => ({ ...c, otherDirectTaxes: 1 }));
    if (missing === "payroll-base")
      f.reference.cells = f.reference.cells.map((c) => ({ ...c, labourIncome: undefined }));
    expect(modelHouseholdIncome(f).gaps.length).toBeGreaterThan(0);
  });
});
