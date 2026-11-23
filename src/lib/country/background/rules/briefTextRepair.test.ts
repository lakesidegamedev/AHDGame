import { describe, expect, it } from "vitest";
import { repairBriefBody } from "./briefTextRepair";

describe("repairBriefBody", () => {
  it("rewrites the old bond sentence as a fixed coupon with the price when written", () => {
    const out = repairBriefBody(
      "In Hungary, its credit rating moved from A to AA. Its nearest bond pays 8.75% and trades at 100.9. Thin demand can push yields up.",
      "HUF"
    );
    expect(out).toContain("Its nearest bond has a fixed coupon of 8.75%, set when it was issued");
    expect(out).toContain("traded at 100.9 when this brief was written");
    expect(out).not.toContain("trades at");
    expect(out).toContain("Thin demand can push yields up.");
  });

  it("turns percent-of-GDP tax figures that are really amounts into local currency", () => {
    const out = repairBriefBody(
      "Poland will consolidate its budget by 0.6% of GDP in fiscal year 2028: tax rises of 1304518589954.9% of GDP and spending cuts of 1118276517099.7% of GDP. Expect a weaker economy and a hit to the government's approval, and a stronger budget for bondholders. Its nearest bond pays 5.75% and trades at 100.2.",
      "PLN"
    );
    expect(out).toContain("tax increases");
    expect(out).toContain("13.0B PLN in tax increases and 11.2B PLN in spending cuts");
    expect(out).not.toMatch(/\d{9,}/);
    expect(out).toContain("fixed coupon of 5.75%");
  });

  it("leaves current wording and genuine small percentages alone", () => {
    const current =
      "X plans a budget adjustment equal to 1.0% of GDP in fiscal year 2029. The package includes 5.0B PLN in tax increases and 1.0B PLN in spending cuts.";
    expect(repairBriefBody(current, "PLN")).toBe(current);
    const small =
      "Finland will consolidate its budget by 1.7% of GDP in fiscal year 2028: tax rises of 0.7% of GDP and spending cuts of 1.0% of GDP. Expect a weaker economy and a hit to the government's approval, and a stronger budget for bondholders.";
    expect(repairBriefBody(small, "EUR")).toBe(small);
  });
});
