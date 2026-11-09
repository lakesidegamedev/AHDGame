import { describe, expect, it } from "vitest";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import type { ResetDepartmentAccountSnapshot } from "@/lib/resetFinance/rules/liveDepartmentAccount";
import { planConvertedLawPrograms } from "./conversionPrograms";
import type { OpeningLawReference } from "@/lib/resetLegislation/openingLaw";
const regional = {
  _id: "old",
  worldId: "w",
  country: "UK",
  scope: "regional",
  regionId: "SCO",
  familyId: "L01",
  annualAgencyAllocation: 101,
  effectiveTurn: 90,
  choice: 3,
} as unknown as ResetLawProgramDocument;
describe("conversion preserves enacted law programs", () => {
  it.each(["SCO", "WAL"] as const)(
    "promotes %s regional choice over a conflicting national law without new authority",
    (countryId) => {
      const reference: OpeningLawReference = {
        familyId: "L01",
        key: `${countryId}:national:L01`,
        country: countryId,
        scope: "national",
        status: "inherited",
        currentLaw: "Inherited health law",
        legalNote: "Synthetic fixture",
        sourceComponents: [
          {
            sourceId: "ordinary",
            historicalDisposition: "retained-legal-lineage",
            fiscalRole: "single-booked-owner",
            fiscalOwner: "L01",
            annualBooked: 80,
            selectedOption: "standard",
            optionIndex: 3,
            treatment: "retain",
          },
          {
            sourceId: "protected",
            historicalDisposition: "retained-legal-lineage",
            fiscalRole: "single-booked-owner",
            fiscalOwner: "L01",
            annualBooked: 20,
            selectedOption: "standard",
            optionIndex: 3,
            treatment: "retain",
            replacementRestriction: "protected-transfer",
          },
        ],
      };
      const account = {
        _id: `${countryId}:health`,
        departmentId: "health",
        familyAnnualDemand: { L01: 150 },
      } as unknown as ResetDepartmentAccountSnapshot;
      const input = {
        programs: [
          { ...regional, choice: "center_left" as const },
          {
            ...regional,
            _id: "national",
            scope: "national" as const,
            choice: "far_right" as const,
          },
        ],
        accounts: [account],
        regions: [{ _id: "A", population: 1, gdp: 10 }],
        rump: [{ gdp: 90 }],
        countryId,
        independent: true,
        scale: 1,
        nationalFamilyIds: ["L01"],
        nationalReferences: { L01: reference },
      };
      for (const programs of [input.programs, [...input.programs].reverse()]) {
        const result = planConvertedLawPrograms({ ...input, programs });
        const successor = result.updates
          .map((row) => row.replaceOne.replacement)
          .filter((row) => row.country === countryId);
        expect(successor).toHaveLength(1);
        expect(successor[0]).toMatchObject({
          scope: "national",
          choice: "center_left",
          effectiveTurn: 90,
          annualAgencyAllocation: 130,
          supersededSourceIds: ["ordinary"],
        });
        expect(successor[0]).not.toHaveProperty("regionId");
        expect(result.removals).toEqual(["old"]);
        expect(account.familyAnnualDemand.L01).toBe(150);
      }
    }
  );
  it("conserves allocations and choices across successor regions", () => {
    const result = planConvertedLawPrograms({
      programs: [regional],
      accounts: [],
      regions: [
        { _id: "LOT", population: 1, gdp: 10 },
        { _id: "HIG", population: 2, gdp: 20 },
      ],
      rump: [{ gdp: 270 }],
      countryId: "SCO",
      independent: true,
      scale: 1,
      nationalFamilyIds: [],
    });
    expect(result.removals).toEqual(["old"]);
    const rows = result.updates.map((row) => row.replaceOne.replacement);
    expect(rows.reduce((sum, row) => sum + row.annualAgencyAllocation, 0)).toBe(101);
    expect(rows.every((row) => row.scope === "regional")).toBe(true);
    expect(rows.every((row) => row.choice === regional.choice && row.effectiveTurn === 90)).toBe(
      true
    );
  });
  it("moves a GDP share of national funding to the successor's actual department", () => {
    const program = { ...regional, scope: "national" as const };
    const result = planConvertedLawPrograms({
      programs: [program],
      accounts: [
        {
          _id: "SCO:health",
          departmentId: "health",
          familyAnnualDemand: { L01: 1 },
        } as unknown as ResetDepartmentAccountSnapshot,
      ],
      regions: [{ _id: "LOT", population: 1, gdp: 10 }],
      rump: [{ gdp: 90 }],
      countryId: "SCO",
      independent: true,
      scale: 1,
    });
    expect(result.updates.map((row) => row.replaceOne.replacement.annualAgencyAllocation)).toEqual([
      91, 10,
    ]);
    expect(result.updates[1].replaceOne.replacement.fundingAccountId).toBe("SCO:health");
  });
});
