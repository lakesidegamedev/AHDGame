import { describe, expect, it } from "vitest";
import {
  completeSuccessorLawReferences,
  releasePromotedRegionalClaims,
  splitInheritedLawAuthority,
  splitNationalLawReferences,
} from "./lawSuccession";
import { openingLawReferences } from "@/lib/resetLegislation/openingLaw";
import { buildResetLawOpeningBoard } from "@/lib/resetLegislation/rules/openingBoard";
import type { RegionalBudget } from "@/lib/db/types/regionalBudget";

describe("independence law coverage", () => {
  it("keeps successor source claims integral without losing the source residual", () => {
    const source = openingLawReferences.filter(
      (row) => row.country === "UK" && row.scope === "national"
    );
    const moved = splitNationalLawReferences(source, 0.085369, true);
    const kept = splitNationalLawReferences(source, 0.085369, false);
    source.forEach((row, i) =>
      row.sourceComponents.forEach((component, j) => {
        expect(Number.isSafeInteger(moved[i].sourceComponents[j].annualBooked)).toBe(true);
        expect(
          moved[i].sourceComponents[j].annualBooked + kept[i].sourceComponents[j].annualBooked
        ).toBe(component.annualBooked);
      })
    );
  });
  it("attributes already-booked funding to a missing default without granting it twice", () => {
    const fallback = openingLawReferences.filter(
      (row) => row.country === "UK" && row.scope === "national"
    );
    const accounts = [{ familyAnnualDemand: { L01: 101 } }, { familyAnnualDemand: { L01: 52 } }];
    const moved = splitInheritedLawAuthority(accounts, 0.2, true);
    const kept = splitInheritedLawAuthority(accounts, 0.2, false);
    expect(moved.L01 + kept.L01).toBe(153);
    const references = completeSuccessorLawReferences({
      current: [],
      fallback,
      countryId: "SCO",
      scope: "national",
      inheritedAuthority: moved,
    });
    expect(
      references
        .find((row) => row.familyId === "L01")!
        .sourceComponents.reduce((sum, row) => sum + row.annualBooked, 0)
    ).toBe(moved.L01);
  });
  it.each(["SCO", "WAL"] as const)(
    "fills missing %s families without inventing funding or overwriting existing choices",
    (countryId) => {
      const fallback = openingLawReferences.filter(
        (row) => row.country === "UK" && row.scope === "national"
      );
      const retained = {
        ...fallback[0],
        key: `${countryId}:national:${fallback[0].familyId}`,
        country: countryId,
        currentLaw: "Existing enacted statute",
      };
      const references = completeSuccessorLawReferences({
        current: [retained],
        fallback,
        countryId,
        scope: "national",
      });
      expect(references.find((row) => row.familyId === retained.familyId)).toBe(retained);
      const defaults = references.filter((row) => row.familyId !== retained.familyId);
      expect(defaults.every((row) => row.status === "inherited-default")).toBe(true);
      expect(
        defaults.flatMap((row) => row.sourceComponents).every((source) => source.annualBooked === 0)
      ).toBe(true);
      expect(() =>
        buildResetLawOpeningBoard({ worldId: "w", countryId, sourceTurn: 100, references })
      ).not.toThrow();
    }
  );
  it("releases only promoted requests and preserves unrelated settlement records", () => {
    const budget = {
      _id: "A",
      enactedBillCosts: 110,
      fundedBillCosts: 90,
      unfundedBillCosts: 20,
      surplus: 30,
      programSettlements: {
        "w:SCO:A:L01": { authorizedCost: 100, fundedAmount: 80, unfundedAmount: 20 },
        other: { authorizedCost: 10, fundedAmount: 10, unfundedAmount: 0 },
      },
    } as unknown as RegionalBudget;
    const next = releasePromotedRegionalClaims(budget, "w", "SCO", ["L01"]);
    expect(next).toMatchObject({
      enactedBillCosts: 10,
      fundedBillCosts: 10,
      unfundedBillCosts: 0,
      surplus: 110,
    });
    expect(Object.keys(next.programSettlements)).toEqual(["other"]);
    expect(next.fundedBillCosts + next.surplus).toBe(budget.fundedBillCosts! + budget.surplus);
  });
});
