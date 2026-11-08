import {
  AT_LOWER_CHAMBER_SPEC,
  ES_LOWER_CHAMBER_SPEC,
  FI_LOWER_CHAMBER_SPEC,
  FR_LOWER_CHAMBER_SPEC,
  GR_LOWER_CHAMBER_SPEC,
  IT_LOWER_CHAMBER_SPEC,
  SE_LOWER_CHAMBER_SPEC,
  TR_LOWER_CHAMBER_SPEC,
} from "./countries/betaParliamentSpecs";
import { describe, expect, it } from "vitest";
import { canonicalTurnsForCycle } from "@/lib/elections/canonicalCycle";
import {
  CANONICAL_REAL_ELECTION_YEARS_BY_PRESET,
  getCycleAnchors,
} from "@/lib/elections/cycleAnchorContext";
import { BY_ELECTION_COUNTRIES } from "@/lib/turn/byElections";
import { IE_CHAMBER_SPECS } from "@/lib/countries/ie/elections/chamberSpecs";
import { NG_CHAMBER_SPECS } from "@/lib/countries/ng/elections/chamberSpecs";
import { CN_CHAMBER_SPECS } from "@/lib/countries/cn/elections/chamberSpecs";
import { BR_CHAMBER_SPECS } from "@/lib/countries/br/elections/chamberSpecs";
import { defineChamberSpec, seatsForRegion, type ChamberSpec } from "./chamberSpec";

const ALL_SPECS: readonly ChamberSpec[] = [
  ...IE_CHAMBER_SPECS,
  ...NG_CHAMBER_SPECS,
  ...CN_CHAMBER_SPECS,
  ...BR_CHAMBER_SPECS,
  FR_LOWER_CHAMBER_SPEC,
  IT_LOWER_CHAMBER_SPEC,
  ES_LOWER_CHAMBER_SPEC,
  SE_LOWER_CHAMBER_SPEC,
  TR_LOWER_CHAMBER_SPEC,
  GR_LOWER_CHAMBER_SPEC,
  AT_LOWER_CHAMBER_SPEC,
  FI_LOWER_CHAMBER_SPEC,
];

const valid: ChamberSpec = {
  chamberId: "dail",
  countryId: "IE",
  electionType: "dail",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "stv",
  cycle: { anchor: "ieDail", periodHours: 192 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
};

describe("defineChamberSpec", () => {
  it("accepts a complete spec", () => {
    expect(defineChamberSpec(valid).chamberId).toBe("dail");
  });

  it.each([
    ["chamberId", { chamberId: "" }],
    ["electionType", { electionType: "" }],
    ["unknown election type", { electionType: "notARealType" }],
    ["constituencies", { constituencies: undefined }],
    ["seats", { seats: undefined }],
    ["electoralSystem", { electoralSystem: undefined }],
    ["cycle anchor", { cycle: { anchor: undefined, periodHours: 192 } }],
    ["cycle period", { cycle: { anchor: "ieDail", periodHours: 0 } }],
    ["gate", { gate: undefined }],
    ["lateJoiners", { lateJoiners: undefined }],
    ["openPrimaryImmediately", { openPrimaryImmediately: undefined }],
    ["byElections", { byElections: undefined }],
    ["snap", { snap: undefined }],
    ["healLiveSeats", { healLiveSeats: undefined }],
    ["snap without an immediate primary", { snap: "shiftsCycle", openPrimaryImmediately: false }],
    ["healing a single-seat chamber", { seats: { kind: "single" }, healLiveSeats: true }],
    ["seat missing policy", { seats: { kind: "stateField", field: "houseDistricts" } }],
    ["empty seat table", { seats: { kind: "table", table: {}, missing: "throw" } }],
    [
      "nationwide with multi-seat",
      { constituencies: "nation", seats: { kind: "table", table: { IE: 2 }, missing: "throw" } },
    ],
    [
      "nationwide mirroring",
      { constituencies: "nation", seats: { kind: "single" }, lateJoiners: "mirrorLivePeer" },
    ],
  ])("throws when %s is missing or wrong", (_label, override) => {
    expect(() => defineChamberSpec({ ...valid, ...override } as unknown as ChamberSpec)).toThrow(
      /Invalid chamber spec/
    );
  });
});

describe("seatsForRegion", () => {
  it("throws on a missing value when the spec says to", () => {
    expect(() => seatsForRegion(valid, "DUB", {})).toThrow(/missing houseDistricts/);
    expect(() =>
      seatsForRegion(
        { ...valid, seats: { kind: "table", table: { DUB: 4 }, missing: "throw" } },
        "COR",
        undefined
      )
    ).toThrow(/no seat entry/);
  });

  it("reads a preset table through the world's preset", () => {
    const byPreset: ChamberSpec = {
      ...valid,
      seats: {
        kind: "presetTable",
        tableFor: (preset) => (preset === "old" ? { DUB: 3 } : { DUB: 9 }),
        missing: "throw",
      },
    };
    expect(seatsForRegion(byPreset, "DUB", undefined, "old")).toBe(3);
    expect(seatsForRegion(byPreset, "DUB", undefined, "new")).toBe(9);
    expect(() => seatsForRegion(byPreset, "COR", undefined, "new")).toThrow(/no seat entry/);
  });

  it("returns one seat for a missing value only when the spec declares it", () => {
    const lenient: ChamberSpec = {
      ...valid,
      seats: { kind: "stateField", field: "houseDistricts", missing: "oneSeat" },
    };
    expect(seatsForRegion(lenient, "DUB", {})).toBe(1);
    expect(seatsForRegion(lenient, "DUB", { houseDistricts: 7 })).toBe(7);
  });
});

describe("chamber specs", () => {
  it("name each chamber once", () => {
    const ids = ALL_SPECS.map((s) => `${s.countryId}/${s.chamberId}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describe no by-election for countries without a by-election phase", () => {
    for (const spec of ALL_SPECS) {
      if (spec.byElections === "none") {
        expect(BY_ELECTION_COUNTRIES).not.toContain(spec.countryId);
      }
    }
  });

  describe.each(Object.keys(CANONICAL_REAL_ELECTION_YEARS_BY_PRESET))("era %s", (preset) => {
    it("anchors and periods match the canonical schedule", () => {
      const ctx = { startingYear: Number.parseInt(preset, 10), preset };
      const anchors = getCycleAnchors(ctx);
      for (const spec of ALL_SPECS) {
        const anchor = anchors[spec.cycle.anchor];
        const base = { electionType: spec.electionType, countryId: spec.countryId, ctx };
        const first = canonicalTurnsForCycle({ ...base, cycle: 1 });
        if (first == null) {
          // Era-gated: the chamber does not run in this preset.
          continue;
        }
        expect(anchor, `${spec.chamberId} anchor`).not.toBeNull();
        const second = canonicalTurnsForCycle({ ...base, cycle: 2 });
        expect(first?.endTurn, `${spec.chamberId} cycle 1`).toBe(anchor);
        expect(second!.endTurn - first!.endTurn, `${spec.chamberId} period`).toBe(
          spec.cycle.periodHours
        );
      }
    });
  });
});
