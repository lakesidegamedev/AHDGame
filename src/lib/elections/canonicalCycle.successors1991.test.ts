import { describe, expect, it } from "vitest";
import type { CountryId } from "@/lib/constants/countries";
import { canonicalTurnsForCycle } from "./canonicalCycle";

const ctx = (preIterationTurns = 0) => ({
  preset: "1991-default",
  startingYear: 1991,
  preIterationTurns,
});
const end = (countryId: string, electionType: string, cycle: number, pre = 0, custom?: number) =>
  canonicalTurnsForCycle({
    electionType,
    cycle,
    countryId: countryId as CountryId,
    ctx: ctx(pre),
    customCycle1EndTurn: custom,
  })?.endTurn;

describe("1991 successor parliament schedules", () => {
  it.each([
    ["RO", "chamberOfDeputies", [96, 288, 480]],
    ["RO", "senat", [96, 288, 480]],
    ["PL", "sejm", [49, 144, 336]],
    ["PL", "senat", [49, 144, 336]],
    ["BG", "nationalAssembly", [38, 230, 422]],
    ["CS", "chamberOfThePeople", [96, 192, 288]],
    ["HU", "nationalAssembly", [192, 384, 576]],
  ])("%s %s ends on its fixed cycle turns", (countryId, type, expected) => {
    expect([1, 2, 3].map((cycle) => end(countryId, type, cycle))).toEqual(expected);
  });

  it("shifts every first election by the pre-iteration offset", () => {
    expect(end("RO", "senat", 1, 48)).toBe(144);
    expect(end("PL", "sejm", 1, 48)).toBe(97);
    expect(end("BG", "nationalAssembly", 1, 48)).toBe(86);
    expect(end("HU", "nationalAssembly", 1, 48)).toBe(240);
  });

  it("lets a custom first turn replace the Bulgarian anchor and keeps the four-year step", () => {
    expect([1, 2].map((cycle) => end("BG", "nationalAssembly", cycle, 0, 100))).toEqual([100, 292]);
  });

  it("has no Polish senate outside the 1991 preset", () => {
    expect(
      canonicalTurnsForCycle({
        electionType: "senat",
        cycle: 1,
        countryId: "PL" as CountryId,
        ctx: { preset: "1953-default", startingYear: 1953 },
      })
    ).toBeNull();
  });
});
