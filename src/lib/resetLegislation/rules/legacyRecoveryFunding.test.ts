import { describe, expect, it } from "vitest";
import {
  transferLegacyFunding,
  reconcileRecoverySpending,
  recoveryImplementation,
  recoveryServiceResponse,
} from "./legacyRecoveryFunding";
const receipt = (programId: string, authorizedCost = 1000, fundedAmount = 800) => ({
  programId,
  legislationTypeId: programId,
  policyOptionId: "l4",
  authorizedCost,
  fundedAmount,
  unfundedAmount: authorizedCost - fundedAmount,
  implementationFactor: fundedAmount / authorizedCost,
  obligationPriority: 5,
  lastSettledTurn: 40,
  validThroughTurn: 50,
});
describe("funding-neutral recovery", () => {
  it("moves an allocation without paying or renewing it", () => {
    const source = receipt("legacy");
    const target = { ...source, programId: "v2", legislationTypeId: "L19" };
    const result = transferLegacyFunding({
      existing: { legacy: source, unrelated: receipt("unrelated") },
      retiredLawIds: ["legacy"],
      replacements: [target],
    });
    expect(result.fundedDelta).toBe(0);
    expect(result.authorizedDelta).toBe(0);
    expect(result.next.v2!.validThroughTurn).toBe(50);
    expect(result.next.legacy).toBeUndefined();
    expect(result.next.unrelated).toEqual(receipt("unrelated"));
  });
  it("rejects invented funded money", () => {
    expect(() =>
      transferLegacyFunding({
        existing: { legacy: receipt("legacy") },
        retiredLawIds: ["legacy"],
        replacements: [receipt("v2", 1000, 801)],
      })
    ).toThrow("may not create funded money");
  });
  it("does not count a replaced v2 allocation twice", () => {
    const result = transferLegacyFunding({
      existing: { legacy: receipt("legacy"), v2: receipt("v2") },
      retiredLawIds: ["legacy"],
      replacements: [receipt("v2", 2000, 1600)],
    });
    expect(result.fundedDelta).toBe(0);
    expect(Object.keys(result.next)).toEqual(["v2"]);
  });
  it("releases a superseded duplicate instead of adding a second benefit", () => {
    expect(
      transferLegacyFunding({
        existing: { legacy: receipt("legacy") },
        retiredLawIds: ["legacy"],
        replacements: [],
      }).fundedDelta
    ).toBe(-800);
  });
  it("handles fractional authorizations separately from rounded receipts", () => {
    const result = reconcileRecoverySpending({
      original: { byCategory: { education: 99.7 }, total: 99.7 },
      removed: [{ category: "education", amount: 100 }],
      replacement: 100,
    });
    expect(result.byCategory).toEqual({ education: 0, resetLegislation: 100 });
    expect(result.total).toBe(100);
  });
  it("refuses substantive un-reconciled category spending", () => {
    expect(() =>
      reconcileRecoverySpending({
        original: { byCategory: { education: 90 }, total: 90 },
        removed: [{ category: "education", amount: 100 }],
        replacement: 100,
      })
    ).toThrow("does not reconcile");
  });
  it("preserves a delivery constraint below the funded ratio", () => {
    expect(recoveryImplementation({ annual: 1000, funded: 800, implementedAnnual: 300 })).toBe(0.3);
  });
  it("does not erase service capacity already retained from an earlier program", () => {
    expect(
      recoveryServiceResponse({
        annual: 1000,
        reviewedAnnual: 10000,
        response: 0.9,
        sourceShare: 1,
        retainedResponse: 0.7,
      })
    ).toBe(0.7);
  });
});
