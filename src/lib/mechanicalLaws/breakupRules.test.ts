import { describe, expect, it } from "vitest";
import { findDominantGroups, type ControlRow, type IndustryRow } from "./enforcementRules";
import type { MechanicalLawLevel } from "./rules";

const THRESHOLD_FIFTY = () => 50;

function levels(byCountry: Record<string, MechanicalLawLevel>) {
  return new Map<string, MechanicalLawLevel>(Object.entries(byCountry));
}

describe("findDominantGroups", () => {
  it("never flags a level 2 country", () => {
    const rows: ControlRow[] = [
      { id: "root", countryId: "US" },
      { id: "sub", countryId: "US", parentId: "root" },
      { id: "rival", countryId: "US" },
    ];
    const industry: IndustryRow[] = [
      { corpId: "root", countryId: "US", sectorType: "manufacturing", revenue: 40 },
      { corpId: "sub", countryId: "US", sectorType: "manufacturing", revenue: 30 },
      { corpId: "rival", countryId: "US", sectorType: "manufacturing", revenue: 30 },
    ];

    const found = findDominantGroups({
      rows,
      industry,
      competitionLevelByCountry: levels({ US: 2 }),
      thresholdForCompetitionLevel: THRESHOLD_FIFTY,
    });

    expect(found).toEqual([]);
  });

  it("flags a level 3 group at 60 percent but not one at 40 percent", () => {
    const rows: ControlRow[] = [
      { id: "root", countryId: "US" },
      { id: "rival", countryId: "US" },
    ];
    const industry: IndustryRow[] = [
      { corpId: "root", countryId: "US", sectorType: "manufacturing", revenue: 60 },
      { corpId: "rival", countryId: "US", sectorType: "manufacturing", revenue: 40 },
    ];

    const found = findDominantGroups({
      rows,
      industry,
      competitionLevelByCountry: levels({ US: 3 }),
      thresholdForCompetitionLevel: THRESHOLD_FIFTY,
    });

    expect(found).toEqual([
      {
        rootId: "root",
        countryId: "US",
        sectorType: "manufacturing",
        sharePercent: 60,
        thresholdPercent: 50,
      },
    ]);
  });

  it("aggregates shares across a root and its controlled subsidiaries", () => {
    const rows: ControlRow[] = [
      { id: "root", countryId: "US" },
      { id: "sub-a", countryId: "US", parentId: "root" },
      { id: "sub-b", countryId: "US", parentId: "sub-a" },
      { id: "rival", countryId: "US" },
    ];
    const industry: IndustryRow[] = [
      { corpId: "root", countryId: "US", sectorType: "manufacturing", revenue: 20 },
      { corpId: "sub-a", countryId: "US", sectorType: "manufacturing", revenue: 25 },
      { corpId: "sub-b", countryId: "US", sectorType: "manufacturing", revenue: 15 },
      { corpId: "rival", countryId: "US", sectorType: "manufacturing", revenue: 40 },
    ];

    const found = findDominantGroups({
      rows,
      industry,
      competitionLevelByCountry: levels({ US: 3 }),
      thresholdForCompetitionLevel: THRESHOLD_FIFTY,
    });

    expect(found).toEqual([
      {
        rootId: "root",
        countryId: "US",
        sectorType: "manufacturing",
        sharePercent: 60,
        thresholdPercent: 50,
      },
    ]);
  });

  it("returns only the strongest industry per group and country", () => {
    const rows: ControlRow[] = [
      { id: "root", countryId: "US" },
      { id: "rival", countryId: "US" },
      { id: "rival-fr", countryId: "FR" },
    ];
    const industry: IndustryRow[] = [
      { corpId: "root", countryId: "US", sectorType: "manufacturing", revenue: 60 },
      { corpId: "rival", countryId: "US", sectorType: "manufacturing", revenue: 40 },
      { corpId: "root", countryId: "US", sectorType: "energy", revenue: 45 },
      { corpId: "rival", countryId: "US", sectorType: "energy", revenue: 5 },
      { corpId: "root", countryId: "FR", sectorType: "manufacturing", revenue: 80 },
      { corpId: "rival-fr", countryId: "FR", sectorType: "manufacturing", revenue: 20 },
    ];

    const found = findDominantGroups({
      rows,
      industry,
      competitionLevelByCountry: levels({ US: 3, FR: 3 }),
      thresholdForCompetitionLevel: THRESHOLD_FIFTY,
    });

    expect(found).toEqual([
      {
        rootId: "root",
        countryId: "FR",
        sectorType: "manufacturing",
        sharePercent: 80,
        thresholdPercent: 50,
      },
      {
        rootId: "root",
        countryId: "US",
        sectorType: "energy",
        sharePercent: 90,
        thresholdPercent: 50,
      },
    ]);
  });
});
