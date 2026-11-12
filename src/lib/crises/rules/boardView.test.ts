import { describe, expect, it } from "vitest";
import {
  boardGroup,
  buildSpreadLinks,
  crisisKind,
  crisisTurnsLeft,
  exposureReasons,
  type BoardCrisisFacts,
  type ViewerExposureContext,
} from "./boardView";

type CrisisFacts = BoardCrisisFacts["crisis"];

function crisis(overrides: Partial<CrisisFacts> = {}): CrisisFacts {
  return {
    scope: "country",
    countryIds: ["US"],
    regionIds: [],
    effects: [],
    status: "active",
    startTurn: 10,
    durationTurns: 10,
    ...overrides,
  };
}

const viewer: ViewerExposureContext = {
  countryId: "US",
  stateId: "US_OH",
  homeStateId: "US_OH",
  ownedSectors: [],
  heldSectors: [],
};

const sectorEffect = (sectorType: string) =>
  ({
    effectType: "flat",
    targetType: "profitMargin",
    metricCategory: null,
    metricField: null,
    sectorType,
    strategyId: null,
    value: -10,
    label: "x",
  }) as const;

describe("exposureReasons", () => {
  it("flags a national crisis in the viewer's country only", () => {
    expect(exposureReasons(crisis(), viewer, false)).toEqual(["country"]);
    expect(exposureReasons(crisis({ countryIds: ["FR"] }), viewer, false)).toEqual([]);
  });

  it("matches a regional crisis on the governed or home state", () => {
    const regional = crisis({ scope: "region", countryIds: ["US"], regionIds: ["US_OH"] });
    expect(exposureReasons(regional, viewer, false)).toEqual(["state"]);
    expect(exposureReasons({ ...regional, regionIds: ["US_TX"] }, viewer, false)).toEqual([]);
  });

  it("treats an unlisted global crisis as touching everyone, a listed one only its countries", () => {
    expect(exposureReasons(crisis({ scope: "global", countryIds: [] }), viewer, false)).toContain(
      "country"
    );
    expect(exposureReasons(crisis({ scope: "global", countryIds: ["FR"] }), viewer, false)).toEqual(
      []
    );
  });

  it("separates owned corporations from holdings and respects the corp's country", () => {
    const hit = crisis({
      scope: "country",
      countryIds: ["US"],
      effects: [sectorEffect("steel") as never],
    });
    const owner = {
      ...viewer,
      countryId: "DE",
      ownedSectors: [{ sectorType: "steel", countryId: "US" }],
    };
    expect(exposureReasons(hit, owner, false)).toEqual(["sector"]);
    const holder = {
      ...viewer,
      countryId: "DE",
      heldSectors: [{ sectorType: "steel", countryId: "US" }],
    };
    expect(exposureReasons(hit, holder, false)).toEqual(["holding"]);
    const elsewhere = {
      ...viewer,
      countryId: "DE",
      ownedSectors: [{ sectorType: "steel", countryId: "FR" }],
    };
    expect(exposureReasons(hit, elsewhere, false)).toEqual([]);
  });

  it("adds office when the viewer can act", () => {
    expect(exposureReasons(crisis({ countryIds: ["FR"] }), viewer, true)).toEqual(["office"]);
  });
});

describe("crisisTurnsLeft and boardGroup", () => {
  const facts = (
    c: Partial<CrisisFacts>,
    extra: Partial<BoardCrisisFacts> = {}
  ): BoardCrisisFacts => ({
    crisis: crisis(c),
    currentTurn: 15,
    decisionOpen: false,
    viewerCanAct: false,
    ...extra,
  });

  it("counts turns left and treats open-ended crises as null", () => {
    expect(crisisTurnsLeft(crisis(), 15)).toBe(5);
    expect(crisisTurnsLeft(crisis({ durationTurns: null }), 15)).toBeNull();
    expect(crisisTurnsLeft(crisis({ status: "resolved" }), 15)).toBeNull();
  });

  it("puts a viewer-actionable crisis first, even when it is winding down", () => {
    expect(boardGroup(facts({ durationTurns: 6 }, { viewerCanAct: true }))).toBe("needsResponse");
  });

  it("groups by status", () => {
    expect(boardGroup(facts({ status: "resolved" }))).toBe("history");
    expect(boardGroup(facts({ durationTurns: 6 }))).toBe("windingDown");
    expect(boardGroup(facts({}, { decisionOpen: true }))).toBe("escalating");
    expect(boardGroup(facts({ startTurn: 14 }))).toBe("escalating");
    expect(boardGroup(facts({}))).toBe("ongoing");
  });
});

describe("crisisKind", () => {
  it("classifies by origin and effects", () => {
    expect(crisisKind(crisis({ opportunity: true }))).toBe("opportunity");
    expect(crisisKind(crisis({ livingConflictEventId: "e" }))).toBe("war");
    expect(crisisKind(crisis({ autoSource: "disaster" }))).toBe("disaster");
    expect(crisisKind(crisis({ effects: [sectorEffect("steel") as never] }))).toBe("economic");
    expect(crisisKind(crisis())).toBe("political");
  });
});

describe("buildSpreadLinks", () => {
  it("chains a family in start order rather than meshing it", () => {
    const links = buildSpreadLinks([
      { id: "c", startTurn: 30, chainFamily: "vietnam" },
      { id: "a", startTurn: 10, chainFamily: "vietnam" },
      { id: "b", startTurn: 20, chainFamily: "vietnam" },
      { id: "z", startTurn: 5 },
    ]);
    expect(links).toEqual([
      { fromId: "a", toId: "b", via: "chain" },
      { fromId: "b", toId: "c", via: "chain" },
    ]);
  });

  it("links crises that answer the same campaign", () => {
    expect(
      buildSpreadLinks([
        { id: "a", startTurn: 1, campaignKey: "ukraine" },
        { id: "b", startTurn: 2, campaignKey: "ukraine" },
      ])
    ).toEqual([{ fromId: "a", toId: "b", via: "campaign" }]);
  });
});
