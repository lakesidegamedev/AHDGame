import { describe, expect, it } from "vitest";
import {
  findNoncompliantSubsidiaries,
  sharesToDropControl,
  type ControlRow,
  type IndustryRow,
  type LawLevels,
} from "./enforcementRules";
import type { MechanicalLawLevel } from "./rules";

function levels(
  subsidiaryLimits: MechanicalLawLevel,
  foreignInvestment: MechanicalLawLevel
): LawLevels {
  return { subsidiaryLimits, foreignInvestment };
}

/** Root plus `count` controlled subsidiaries in `countryId`, formalized in order. */
function groupOf(
  rootId: string,
  rootCountryId: string,
  countryId: string,
  count: number,
  firstTurn = 10
): ControlRow[] {
  const rows: ControlRow[] = [{ id: rootId, countryId: rootCountryId }];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `${rootId}-${countryId}-${i + 1}`,
      countryId,
      parentId: rootId,
      formalizedAtTurn: firstTurn + i * 10,
    });
  }
  return rows;
}

describe("findNoncompliantSubsidiaries", () => {
  it("finds nothing while every law sits at level 0", () => {
    const rows: ControlRow[] = [
      { id: "root-us", countryId: "US" },
      { id: "sub-fr-a", countryId: "FR", parentId: "root-us", formalizedAtTurn: 10 },
      { id: "sub-fr-b", countryId: "FR", parentId: "root-us", formalizedAtTurn: 20 },
      { id: "sub-fr-c", countryId: "FR", parentId: "root-us", formalizedAtTurn: 30 },
      { id: "sub-fr-d", countryId: "FR", parentId: "root-us", formalizedAtTurn: 40 },
    ];
    const industry: IndustryRow[] = [
      { corpId: "sub-fr-a", countryId: "FR", sectorType: "energy", revenue: 500 },
      { corpId: "sub-fr-b", countryId: "FR", sectorType: "energy", revenue: 500 },
    ];

    const findings = findNoncompliantSubsidiaries({
      rows,
      levelsByCountry: new Map([["FR", levels(0, 0)]]),
      industry,
    });

    expect(findings).toEqual([]);
  });

  it("flags only the newest subsidiaries over a country's subsidiary cap", () => {
    // Four subsidiaries in FR (cap 3 at level 4) plus three in DE, where three
    // subsidiaries sit exactly at the cap and are therefore compliant.
    const rows: ControlRow[] = [
      ...groupOf("root-fr", "FR", "FR", 4, 10),
      ...groupOf("root-fr", "FR", "DE", 3, 5),
    ];

    const findings = findNoncompliantSubsidiaries({
      rows,
      levelsByCountry: new Map([
        ["FR", levels(4, 0)],
        ["DE", levels(4, 0)],
      ]),
      industry: [],
    });

    expect(findings).toEqual([
      {
        corpId: "root-fr-FR-4",
        rootId: "root-fr",
        countryId: "FR",
        reason: "subsidiaryCap",
      },
    ]);
  });

  it("does not count subsidiaries in another country against the cap", () => {
    // Three FR subsidiaries (at the cap) and four in JP: JP's own cap of 3 is
    // breached in JP, and FR is still compliant because JP is not counted.
    const rows: ControlRow[] = [
      ...groupOf("root-fr", "FR", "FR", 3, 10),
      ...groupOf("root-fr", "FR", "JP", 4, 100),
    ];

    const findings = findNoncompliantSubsidiaries({
      rows,
      levelsByCountry: new Map([
        ["FR", levels(4, 0)],
        ["JP", levels(4, 0)],
      ]),
      industry: [],
    });

    expect(findings).toEqual([
      {
        corpId: "root-fr-JP-4",
        rootId: "root-fr",
        countryId: "JP",
        reason: "subsidiaryCap",
      },
    ]);
  });

  it("flags a foreign-controlled subsidiary in a country that bans foreign investment", () => {
    const rows: ControlRow[] = [
      { id: "root-us", countryId: "US" },
      { id: "sub-fr-foreign", countryId: "FR", parentId: "root-us" },
      { id: "root-fr", countryId: "FR" },
      { id: "sub-fr-domestic", countryId: "FR", parentId: "root-fr" },
    ];

    const findings = findNoncompliantSubsidiaries({
      rows,
      levelsByCountry: new Map([["FR", levels(0, 4)]]),
      industry: [],
    });

    expect(findings).toEqual([
      {
        corpId: "sub-fr-foreign",
        rootId: "root-us",
        countryId: "FR",
        reason: "foreignBan",
      },
    ]);
  });

  it("sheds the largest foreign subsidiaries first and stops at the foreign share cap", () => {
    // FR energy totals 1000 across every operator, so the 10% cap allows 100
    // of foreign-controlled revenue. The US group holds 450 of it.
    const rows: ControlRow[] = [
      { id: "root-us", countryId: "US" },
      { id: "sub-c", countryId: "FR", parentId: "root-us" },
      { id: "sub-a", countryId: "FR", parentId: "root-us" },
      { id: "sub-b", countryId: "FR", parentId: "root-us" },
      { id: "dom-fr", countryId: "FR" },
    ];
    const industry: IndustryRow[] = [
      { corpId: "dom-fr", countryId: "FR", sectorType: "energy", revenue: 550 },
      { corpId: "sub-c", countryId: "FR", sectorType: "energy", revenue: 300 },
      { corpId: "sub-a", countryId: "FR", sectorType: "energy", revenue: 100 },
      { corpId: "sub-b", countryId: "FR", sectorType: "energy", revenue: 50 },
    ];

    const findings = findNoncompliantSubsidiaries({
      rows,
      levelsByCountry: new Map([["FR", levels(0, 3)]]),
      industry,
    });

    // sub-c (300) goes first, then sub-a (100) brings foreign revenue from 450
    // down to 50, under the 100 cap. sub-b (50) is never reached, even though
    // its id would sort first.
    expect(findings).toEqual([
      { corpId: "sub-a", rootId: "root-us", countryId: "FR", reason: "foreignShareCap" },
      { corpId: "sub-c", rootId: "root-us", countryId: "FR", reason: "foreignShareCap" },
    ]);
  });

  it("never flags a foreign root's own sectors under the foreign share cap", () => {
    const rows: ControlRow[] = [
      { id: "root-us", countryId: "US" },
      { id: "sub-fr", countryId: "FR", parentId: "root-us" },
      { id: "dom-fr", countryId: "FR" },
    ];
    const industry: IndustryRow[] = [
      { corpId: "dom-fr", countryId: "FR", sectorType: "energy", revenue: 600 },
      { corpId: "root-us", countryId: "FR", sectorType: "energy", revenue: 200 },
      { corpId: "sub-fr", countryId: "FR", sectorType: "energy", revenue: 200 },
    ];

    const findings = findNoncompliantSubsidiaries({
      rows,
      levelsByCountry: new Map([["FR", levels(0, 3)]]),
      industry,
    });

    expect(findings).toEqual([
      { corpId: "sub-fr", rootId: "root-us", countryId: "FR", reason: "foreignShareCap" },
    ]);
  });

  it("reports a company that breaches two rules once, and foreign ban wins", () => {
    // Every FR subsidiary is both foreign (banned outright) and over the
    // subsidiary cap; the cap's newest offender is also the fourth subsidiary.
    const rows: ControlRow[] = groupOf("root-us", "US", "FR", 4, 10);

    const findings = findNoncompliantSubsidiaries({
      rows,
      levelsByCountry: new Map([["FR", levels(4, 4)]]),
      industry: [],
    });

    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.reason === "foreignBan")).toBe(true);
    expect(findings.find((f) => f.corpId === "root-us-FR-4")?.reason).toBe("foreignBan");
  });
});

describe("sharesToDropControl", () => {
  it("returns the shares a controlling holder must sell to hold half", () => {
    expect(sharesToDropControl(1000, 800)).toBe(300);
  });

  it("returns 0 for a holder that already holds half or less", () => {
    expect(sharesToDropControl(1000, 500)).toBe(0);
    expect(sharesToDropControl(1000, 400)).toBe(0);
  });

  it("rounds up an odd share count and floors the keepable half", () => {
    expect(sharesToDropControl(1001, 600)).toBe(100);
  });

  it("returns 0 for bad inputs", () => {
    expect(sharesToDropControl(0, 800)).toBe(0);
    expect(sharesToDropControl(-1000, 800)).toBe(0);
    expect(sharesToDropControl(1000, 0)).toBe(0);
    expect(sharesToDropControl(1000, -5)).toBe(0);
    expect(sharesToDropControl(Number.NaN, 800)).toBe(0);
    expect(sharesToDropControl(1000, Number.NaN)).toBe(0);
  });
});
