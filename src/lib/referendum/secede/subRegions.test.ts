import { describe, expect, it } from "vitest";
import { sovereigntyRegionForSuccessor } from "../rules/sovereigntyRegions";
import {
  CAPITAL_SUBREGION,
  SUB_REGION_SEEDS,
  isSecedingCountryId,
  secessionSource,
  type SecedingCountryId,
} from "./subRegions";

const SUCCESSORS = Object.keys(SUB_REGION_SEEDS) as SecedingCountryId[];

describe("secession sources", () => {
  it("resolves every successor to an independence region in the registry", () => {
    for (const successor of SUCCESSORS) {
      const entry = sovereigntyRegionForSuccessor(successor);
      expect(entry?.kind).toBe("independence");
      expect(secessionSource(successor)).toEqual({
        fromCountryId: entry!.countryId,
        regionId: entry!.regionId,
      });
    }
  });

  it("keeps the UK regions under their own ids", () => {
    expect(secessionSource("SCO")).toEqual({ fromCountryId: "UK", regionId: "SCO" });
    expect(secessionSource("WAL")).toEqual({ fromCountryId: "UK", regionId: "WAL" });
  });

  it("seeds a capital among each successor's sub-regions", () => {
    for (const successor of SUCCESSORS) {
      const ids = SUB_REGION_SEEDS[successor].map((region) => region._id);
      expect(ids).toContain(CAPITAL_SUBREGION[successor]);
      expect(SUB_REGION_SEEDS[successor].every((region) => region.countryId === successor)).toBe(
        true
      );
    }
  });

  it("finds Quebec under Canada's prefixed region id", () => {
    expect(secessionSource("QC")).toEqual({ fromCountryId: "CA", regionId: "CA_QC" });
  });

  it("recognises only built successors", () => {
    expect(isSecedingCountryId("SCO")).toBe(true);
    expect(isSecedingCountryId("CA_QC")).toBe(false);
    expect(isSecedingCountryId("toString")).toBe(false);
    expect(isSecedingCountryId(null)).toBe(false);
  });
});
