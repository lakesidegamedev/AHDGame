import { describe, expect, it } from "vitest";
import { canonicalTurnsForCycle, pickNextCanonicalCycle } from "@/lib/elections/canonicalCycle";
import { usRegionalElectionYear2027 } from "./regionalElectionCalendar";

describe("US 2027 regional calendars", () => {
  it.each([
    ["KY", 2027],
    ["LA", 2027],
    ["MS", 2027],
    ["NH", 2028],
    ["VT", 2028],
    ["VA", 2029],
    ["NJ", 2029],
    ["CA", 2030],
  ] as const)("anchors %s governor in %i", (state, year) => {
    expect(usRegionalElectionYear2027(state, "governor", 1)).toBe(year);
  });
  it("preserves two-year governors and the New Jersey 4-2-4 senate sequence", () => {
    expect(usRegionalElectionYear2027("VT", "governor", 2)).toBe(2030);
    expect(
      [1, 2, 3, 4].map((cycle) => usRegionalElectionYear2027("NJ", "stateSenate", cycle))
    ).toEqual([2027, 2031, 2033, 2037]);
    expect(usRegionalElectionYear2027("MN", "stateSenate", 1)).toBe(2030);
    expect(usRegionalElectionYear2027("KS", "stateSenate", 2)).toBe(2032);
  });
  it("spawns start-year races rather than silently skipping them", () => {
    expect(
      pickNextCanonicalCycle({
        countryId: "US",
        state: "KY",
        electionType: "governor",
        prevCycle: 0,
        currentTurn: 1,
        ctx: { preset: "2027-default", startingYear: 2027 },
      })
    ).toMatchObject({ cycle: 1, endTurn: 48, primaryEndTurn: 24 });
  });
  it("preserves Minnesota's decennial short term through two census cycles", () => {
    expect(
      Array.from({ length: 9 }, (_, i) => usRegionalElectionYear2027("MN", "stateSenate", i + 1))
    ).toEqual([2030, 2032, 2036, 2040, 2042, 2046, 2050, 2052, 2056]);
  });
  it("isolates overlapping state identifiers in other countries and presets", () => {
    const base = {
      state: "KY",
      electionType: "governor",
      cycle: 1,
      ctx: { preset: "2027-default", startingYear: 2027 },
    };
    expect(canonicalTurnsForCycle({ ...base, countryId: "JP" })?.endTurn).toBe(192);
    expect(
      canonicalTurnsForCycle({
        ...base,
        countryId: "US",
        ctx: { preset: "2023-default", startingYear: 2023 },
      })?.endTurn
    ).toBe(192);
  });
});
