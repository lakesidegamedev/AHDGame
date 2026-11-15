import { describe, expect, it } from "vitest";
import { getCycleAnchors } from "@/lib/elections/cycleAnchorContext";
import { canonicalTurnsForCycle } from "@/lib/elections/canonicalCycle";
import { seatsForRegion } from "@/lib/elections/scheduling/chamberSpec";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { caRegions2027 } from "../data/caRegions2027";
import { CA_COMMONS_SPEC } from "./chamberSpecs";

describe("Canada Commons chamber spec", () => {
  it("is a regional contest over every province and territory", () => {
    expect(CA_COMMONS_SPEC.countryId).toBe("CA");
    expect(CA_COMMONS_SPEC.constituencies).toBe("regions");
    expect(CA_COMMONS_SPEC.cycle).toEqual({ anchor: "caCommons", periodHours: 192 });
  });

  it("finds a seat count on every region and totals 343", () => {
    const total = caRegions2027.reduce(
      (sum, region) => sum + seatsForRegion(CA_COMMONS_SPEC, region._id, region),
      0
    );
    expect(total).toBe(343);
  });

  it("anchors the first regular election to 2029 in the 2027 world only", () => {
    const anchors = getCycleAnchors({ startingYear: 2027, preset: "2027-default" });
    expect(anchors.caCommons).toBe((2029 - 2027 + 1) * 48);
    for (const preset of [
      "1953-default",
      "1979-default",
      "1991-default",
      "2019-default",
    ] as const) {
      const other = getCycleAnchors({ startingYear: getStartingYearForPreset(preset), preset });
      expect(other.caCommons, preset).toBeNull();
    }
  });

  it("schedules a four-year fixed term from the anchor", () => {
    const ctx = { startingYear: 2027, preset: "2027-default" };
    const first = canonicalTurnsForCycle({ electionType: "caCommons", cycle: 1, ctx });
    const second = canonicalTurnsForCycle({
      electionType: "caCommons",
      cycle: 2,
      priorEndTurn: first?.endTurn,
      ctx,
    });
    expect(first?.endTurn).toBe(144);
    expect(second?.endTurn).toBe(144 + 192);
  });
});
