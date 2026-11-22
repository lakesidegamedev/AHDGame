import { describe, expect, it } from "vitest";
import { govtHealthcareLatentUnits } from "./govtHealthcareLatentDemand";
import { GOVT_HEALTHCARE_DEMAND_RATE } from "@/lib/constants/commodities";

const budget = (countryId: string, healthcare: number) => ({
  countryId,
  spending: { byCategory: { healthcare } },
});

describe("govtHealthcareLatentUnits", () => {
  it("converts local-currency budgets to anchor before applying the base price", () => {
    const fx = (id: string | undefined) => (id === "JP" ? 100 : 1);
    const units = govtHealthcareLatentUnits([budget("US", 4800), budget("JP", 480000)], 10, fx);
    // Both budgets are 4800 anchor a year: 2 * (4800 / 48 / 10) * rate.
    expect(units).toBeCloseTo(2 * 10 * GOVT_HEALTHCARE_DEMAND_RATE, 6);
  });

  it("does not inflate a weak-currency budget by its face value", () => {
    const raw = govtHealthcareLatentUnits([budget("JP", 480000)], 10, () => 1);
    const converted = govtHealthcareLatentUnits([budget("JP", 480000)], 10, () => 100);
    expect(converted).toBeCloseTo(raw / 100, 6);
  });

  it("ignores empty budgets", () => {
    expect(govtHealthcareLatentUnits([{ countryId: "US" }, budget("US", 0)], 10, () => 1)).toBe(0);
  });
});
