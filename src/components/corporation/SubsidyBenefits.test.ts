import { describe, expect, it } from "vitest";
import { subsidyCoveredSectors, type SubsidyEntry } from "./SubsidyBenefits";
import type { SectorDetail } from "./CorporationPageTypes";

const sector = (stateId: string, sectorType: string) =>
  ({ stateId, sectorType, countryId: "USA" }) as unknown as SectorDetail;

const stateSubsidy: SubsidyEntry = {
  id: "s1",
  scope: "state",
  stateId: "OH",
  scopeType: "sector",
  targetSectorType: "manufacturing",
  targetStrategyId: null,
  domesticOnly: false,
  countryId: "USA",
};

describe("subsidyCoveredSectors", () => {
  it("lists only the sectors the subsidy margin applies to", () => {
    const sectors = [
      sector("OH", "manufacturing"),
      sector("OH", "tech"),
      sector("TX", "manufacturing"),
    ];
    expect(subsidyCoveredSectors(stateSubsidy, "OH", "USA", sectors)).toHaveLength(1);
  });

  it("covers every sector in the state for an economy-wide subsidy", () => {
    const wide = { ...stateSubsidy, scopeType: "economy_wide" as const, targetSectorType: null };
    const sectors = [sector("OH", "manufacturing"), sector("OH", "tech"), sector("TX", "tech")];
    expect(subsidyCoveredSectors(wide, "OH", "USA", sectors)).toHaveLength(2);
  });
});
