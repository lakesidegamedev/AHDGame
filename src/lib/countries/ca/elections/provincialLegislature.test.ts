import { describe, expect, it } from "vitest";
import { canonicalTurnsForCycle } from "@/lib/elections/canonicalCycle";
import { seatsForRegion } from "@/lib/elections/scheduling/chamberSpec";
import { getElectionMethod } from "@/lib/elections/electionMethod";
import { MULTI_SEAT_TYPES, officeKeyForElectionType } from "@/lib/utils/electionLabels";
import { caRegions2027 } from "../data/caRegions2027";
import {
  CA_PROVINCIAL_LEGISLATURES,
  CA_PROVINCIAL_SEATS_TOTAL,
} from "../data/caProvincialLegislatures";
import { CA_CONFIG } from "../institutionsFacts";
import { provincialCycle1EndTurn } from "../rules/provincialLegislature";
import { CA_PROVINCIAL_SPEC } from "./chamberSpecs";

const CTX_2027 = { startingYear: 2027, preset: "2027-default" };

describe("Canada provincial legislatures", () => {
  it("cover every province and territory and nothing else", () => {
    expect(Object.keys(CA_PROVINCIAL_LEGISLATURES).sort()).toEqual(
      caRegions2027.map((r) => r._id).sort()
    );
  });

  it("seat the configured provincial chamber size", () => {
    expect(CA_PROVINCIAL_SEATS_TOTAL).toBe(780);
    expect(CA_CONFIG.subNationalChamber?.seats).toBe(CA_PROVINCIAL_SEATS_TOTAL);
    const total = caRegions2027.reduce(
      (sum, region) => sum + seatsForRegion(CA_PROVINCIAL_SPEC, region._id, region),
      0
    );
    expect(total).toBe(780);
  });

  it("end each legislature's first race in its fixed-date election year", () => {
    expect(provincialCycle1EndTurn("CA_AB", CTX_2027)).toBe(48);
    expect(provincialCycle1EndTurn("CA_BC", CTX_2027)).toBe(96);
    expect(provincialCycle1EndTurn("CA_ON", CTX_2027)).toBe(144);
    expect(provincialCycle1EndTurn("CA_QC", CTX_2027)).toBe(192);
    expect(provincialCycle1EndTurn("CA_XX", CTX_2027)).toBeUndefined();
  });

  it("shift with a completed founding phase", () => {
    expect(provincialCycle1EndTurn("CA_QC", { ...CTX_2027, preIterationTurns: 10 })).toBe(202);
  });

  it("run four-year cycles from each region's own anchor", () => {
    const anchor = CA_PROVINCIAL_SPEC.regionAnchor!("CA_QC", CTX_2027.preset, CTX_2027);
    const first = canonicalTurnsForCycle({
      electionType: "provincialLegislature",
      countryId: "CA",
      cycle: 1,
      customCycle1EndTurn: anchor,
      ctx: CTX_2027,
    });
    const second = canonicalTurnsForCycle({
      electionType: "provincialLegislature",
      countryId: "CA",
      cycle: 2,
      customCycle1EndTurn: anchor,
      ctx: CTX_2027,
    });
    expect(first?.endTurn).toBe(192);
    expect(second!.endTurn - first!.endTurn).toBe(CA_PROVINCIAL_SPEC.cycle.periodHours);
  });

  it("do not run in eras without Canada", () => {
    expect(
      canonicalTurnsForCycle({
        electionType: "provincialLegislature",
        countryId: "CA",
        cycle: 1,
        customCycle1EndTurn: 48,
        ctx: { startingYear: 2019, preset: "2019-default" },
      })
    ).toBeNull();
  });

  it("seat winners as provincial members across the whole delegation", () => {
    expect(officeKeyForElectionType("provincialLegislature", "CA")).toBe("provincialLegislature");
    expect(MULTI_SEAT_TYPES.has("provincialLegislature")).toBe(true);
    expect(getElectionMethod("CA", "provincialLegislature")).toBe("pr_hareQuota");
  });
});
