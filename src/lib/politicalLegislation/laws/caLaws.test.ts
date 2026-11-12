import { describe, expect, it } from "vitest";
import { getCatalog, isLawActive } from "../catalog";
import { validateCatalog } from "../validate";
import { CA_LAWS } from "@/lib/countries/ca/data/caLaws";

describe("Canada catalog", () => {
  it("passes the full catalog validator", () => {
    expect(validateCatalog(CA_LAWS, "CA")).toEqual([]);
  });

  it("carries 6 tax laws, a primary per metric and a secondary pool", () => {
    expect(CA_LAWS.filter((l) => l.kind === "tax")).toHaveLength(6);
    expect(CA_LAWS.filter((l) => l.kind === "primary")).toHaveLength(63);
    expect(CA_LAWS.filter((l) => l.kind === "secondary")).toHaveLength(41);
  });

  it("seeds the intelligence fund unfunded, like the other books", () => {
    const law = CA_LAWS.find((l) => l.id === "ca.sec.intelligenceFund")!;
    expect(law.baselineLevel).toBe(0);
    expect(law.budgetKeyOverride).toBe("intelligence");
  });

  it("uses Canadian pension and tax settings", () => {
    const pension = CA_LAWS.find((l) => l.id === "ca.health.socialInsurance.primary")!;
    expect(pension.budgetKeyOverride).toBe("statePensions");
    const payroll = CA_LAWS.find((l) => l.id === "ca.tax.payrollTax")!;
    expect(payroll.taxPolicy?.baselineRate).toBe(9.8);
  });
});
