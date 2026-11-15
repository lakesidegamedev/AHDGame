import { describe, expect, it } from "vitest";
import { CA_PROVINCIAL_LEGISLATURES } from "../data/caProvincialLegislatures";
import { caProvincialElectionYearForWorld, provincialCycle1EndTurn } from "./provincialLegislature";
import { provincialElectionYearForWorld } from "./provincialElectionCalendar";
import { canonicalTurnsForCycle } from "@/lib/elections/canonicalCycle";
import { resolveElectionYear } from "@/lib/utils/formatters";
import { TURNS_PER_YEAR } from "@/lib/constants/calendar";

describe("client-safe Canadian provincial election labels", () => {
  it.each(Object.keys(CA_PROVINCIAL_LEGISLATURES))(
    "matches scheduled elections for %s across later cycles and founding offsets",
    (region) => {
      for (const offset of [0, 10]) {
        const ctx = { startingYear: 2027, preset: "2027-default", preIterationTurns: offset };
        for (const cycle of [1, 2, 3]) {
          const scheduled = canonicalTurnsForCycle({
            electionType: "provincialLegislature",
            countryId: "CA",
            cycle,
            customCycle1EndTurn: provincialCycle1EndTurn(region, ctx),
            ctx,
          });
          expect(scheduled).not.toBeNull();
          const expectedYear =
            ctx.startingYear + Math.floor((scheduled!.endTurn - offset - 1) / TURNS_PER_YEAR);
          expect(
            resolveElectionYear(
              { countryId: "CA", state: region, electionType: "provincialLegislature", cycle },
              ctx
            )
          ).toBe(expectedYear);
          expect(
            caProvincialElectionYearForWorld(
              region,
              "provincialLegislature",
              cycle,
              "CA",
              ctx.preset
            )
          ).toBe(expectedYear);
        }
      }
    }
  );

  it("retains the authored opening year and four-year cadence", () => {
    expect(
      provincialElectionYearForWorld(2030, "provincialLegislature", 1, "CA", "2027-default")
    ).toBe(2030);
    expect(
      provincialElectionYearForWorld(2030, "provincialLegislature", 2, "CA", "2027-default")
    ).toBe(2034);
  });

  it("does not label another country's elections, another era, or an unknown region", () => {
    expect(
      provincialElectionYearForWorld(2027, "provincialLegislature", 1, "US", "2027-default")
    ).toBeUndefined();
    expect(
      provincialElectionYearForWorld(2027, "caCommons", 1, "CA", "2027-default")
    ).toBeUndefined();
    expect(
      provincialElectionYearForWorld(2027, "provincialLegislature", 1, "CA", "1991-default")
    ).toBeUndefined();
    expect(
      provincialElectionYearForWorld(undefined, "provincialLegislature", 1, "CA", "2027-default")
    ).toBeUndefined();
  });
});
