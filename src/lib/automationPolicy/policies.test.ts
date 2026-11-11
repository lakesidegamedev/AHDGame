import { describe, expect, it } from "vitest";
import {
  automationPolicyFor,
  foldAutomationPolicies,
  lawAdjustedLabourFactor,
  lawWageCostMultiplier,
  withAutomationUnionBias,
} from "./policies";
import { NO_AUTOMATION_POLICY } from "./rules";

describe("foldAutomationPolicies", () => {
  it("reads the modern ids for the law book countries and the legacy automation tax elsewhere", () => {
    const map = foldAutomationPolicies([
      { legislationTypeId: "us.sec.automationTax", policyOptionIndex: 3, scope: "national" },
      { legislationTypeId: "us.sec.retrainingGuarantee", policyOptionIndex: 2, scope: "national" },
      { legislationTypeId: "uk.sec.hiringSubsidy", policyOptionIndex: 4, scope: "national" },
      {
        legislationTypeId: "uk.sec.automationPensionLevy",
        policyOptionIndex: 1,
        scope: "national",
      },
      { legislationTypeId: "uk.sec.transitionCompacts", policyOptionIndex: 3, scope: "national" },
      { legislationTypeId: "us.sec.wageInsurance", policyOptionIndex: 2, scope: "national" },
      { legislationTypeId: "ie_automation_tax", policyOptionIndex: 0, scope: "national" },
      { legislationTypeId: "de.sec.automationTax", policyOptionIndex: 2, scope: "national" },
    ]);
    expect(map.get("US")).toEqual({
      ...NO_AUTOMATION_POLICY,
      automationTax: 3,
      retraining: 2,
      wageInsurance: 2,
    });
    expect(map.get("UK")).toEqual({
      ...NO_AUTOMATION_POLICY,
      hiringSubsidy: 4,
      pensionLevy: 1,
      transitionCompacts: 3,
    });
    expect(map.get("IE")).toEqual({ ...NO_AUTOMATION_POLICY, automationTax: 4 });
    expect(map.get("DE")).toEqual({ ...NO_AUTOMATION_POLICY, automationTax: 2 });
  });

  it("ignores regional rows, other laws, and legacy options right of centre", () => {
    const map = foldAutomationPolicies([
      { legislationTypeId: "us.sec.automationTax", policyOptionIndex: 4, scope: "state" },
      { legislationTypeId: "us.sec.carbonPrice", policyOptionIndex: 4, scope: "national" },
      { legislationTypeId: "ie_automation_tax", policyOptionIndex: 5, scope: "national" },
      { legislationTypeId: "us.sec.hiringSubsidy", policyOptionIndex: 9, scope: "national" },
    ]);
    expect(map.has("US")).toBe(true);
    expect(map.get("US")).toEqual({ ...NO_AUTOMATION_POLICY, hiringSubsidy: 4 });
    expect(map.get("IE")).toEqual(NO_AUTOMATION_POLICY);
  });

  it("returns a neutral policy for an unknown country", () => {
    expect(automationPolicyFor(new Map(), "US")).toBe(NO_AUTOMATION_POLICY);
    expect(automationPolicyFor(undefined, "US")).toBe(NO_AUTOMATION_POLICY);
    expect(automationPolicyFor(new Map(), null)).toBe(NO_AUTOMATION_POLICY);
  });
});

describe("turn adapters", () => {
  const byCountry = new Map([
    ["US", { ...NO_AUTOMATION_POLICY, automationTax: 3, hiringSubsidy: 2, transitionCompacts: 4 }],
  ]);

  it("are neutral when the world has no automation laws", () => {
    expect(lawAdjustedLabourFactor(0.45, undefined, "US")).toBe(0.45);
    expect(lawWageCostMultiplier(undefined, "US")).toBe(1);
  });

  it("keep more crew and cheapen wages in a country with the laws", () => {
    expect(lawAdjustedLabourFactor(0.45, byCountry, "US")).toBeGreaterThan(0.45);
    expect(lawAdjustedLabourFactor(0.45, byCountry, "UK")).toBe(0.45);
    expect(lawAdjustedLabourFactor(1, byCountry, "US")).toBe(1);
    expect(lawWageCostMultiplier(byCountry, "US")).toBe(0.985);
    expect(lawWageCostMultiplier(byCountry, "UK")).toBe(1);
  });

  it("add the compact bias on top of the player union laws, inside the bias range", () => {
    const out = withAutomationUnionBias(
      new Map([
        ["US", 40],
        ["UK", 5],
      ]),
      byCountry
    );
    expect(out.get("US")).toBe(50);
    expect(out.get("UK")).toBe(5);
    expect(withAutomationUnionBias(new Map(), byCountry).get("US")).toBe(14);
    expect(withAutomationUnionBias(new Map([["US", 3]]), undefined).get("US")).toBe(3);
  });
});
