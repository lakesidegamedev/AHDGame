import { describe, expect, it } from "vitest";
import { openingLawReferences } from "@/lib/resetLegislation/openingLaw";
import { openingPovertyPrograms } from "./povertyOpening";
import { povertyDeliveredPressure, type PovertyProgram } from "./poverty";

describe("unreplaced opening poverty laws", () => {
  const reference = openingLawReferences.find(
    (row) => row.country === "US" && row.scope === "national" && row.familyId === "L02"
  )!;
  const board = {
    countryId: "US" as const,
    scope: "national" as const,
    sourceTurn: 1,
    references: { L02: reference },
  };
  const account = { _id: "account", countryId: "US", familyAnnualDemand: { L02: 100 } };

  it("keeps opening social insurance responsive to paid funding without a newly passed bill", () => {
    const programs = openingPovertyPrograms({
      worldId: "world",
      boards: [board],
      accounts: [account],
      replacements: [],
    });
    expect(programs).toHaveLength(1);
    expect(programs[0]!.familyId).toBe("L02");
    const pressure = (factor: number) =>
      povertyDeliveredPressure(
        programs,
        new Map([[programs[0]!._id, { implementationFactor: factor, lastSettledTurn: 10 }]]),
        10
      );
    expect(pressure(0)).toBe(0);
    expect(pressure(1)).toBeGreaterThan(0);
    expect(pressure(0.5)).toBeCloseTo(pressure(1) / 2);
  });

  it("suppresses the opening family even when its replacement provides no effects", () => {
    const replacement: PovertyProgram = {
      _id: "replacement",
      country: "US",
      scope: "national",
      familyId: "L02",
      effectiveTurn: 2,
      fundingAccountId: "account",
      choice: "leave_to_states",
      primaryMetricEffects: [],
    };
    expect(
      openingPovertyPrograms({
        worldId: "world",
        boards: [board],
        accounts: [account],
        replacements: [replacement],
      })
    ).toEqual([]);
  });

  it("apportions regional opening relief to its actual source-law settlements", () => {
    const programs = openingPovertyPrograms({
      worldId: "world",
      boards: [
        {
          ...board,
          scope: "regional",
          regionId: "CA",
          references: {
            L02: {
              ...reference,
              scope: "regional",
              sourceComponents: [
                { ...reference.sourceComponents[0]!, sourceId: "source-a", annualBooked: 75 },
                { ...reference.sourceComponents[0]!, sourceId: "source-b", annualBooked: 25 },
              ],
            },
          },
        },
      ],
      accounts: [],
      replacements: [],
    });
    expect(programs).toHaveLength(2);
    expect(programs.map((program) => program.settlementLawId)).toEqual(["source-a", "source-b"]);
    const [a, b] = programs;
    expect(a!.primaryMetricEffects[0]!.favorableNormalizedPoints).toBeCloseTo(
      b!.primaryMetricEffects[0]!.favorableNormalizedPoints * 3
    );
    expect(programs.every((program) => program.regionId === "CA")).toBe(true);
  });
});
