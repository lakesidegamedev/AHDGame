import { describe, expect, it } from "vitest";
import {
  evaluatePreflight,
  REMOVED_ALWAYS_ON_FLAGS,
  type PreflightInput,
  type StateEvidence,
} from "./preflight2027";

const goodState = (id: string, countryId: string, extra: Partial<StateEvidence> = {}) => ({
  id,
  countryId,
  gdp: 10,
  population: 100,
  houseDistricts: 2,
  stateSenateSeats: 3,
  ...extra,
});

const allTrue: Record<string, unknown> = {
  ...Object.fromEntries(REMOVED_ALWAYS_ON_FLAGS.map((flag) => [flag, true])),
  nppAutonomyLevel: "v6",
};

function input(overrides: Partial<PreflightInput> = {}): PreflightInput {
  return {
    mode: "pre-reset",
    countries: ["US", "DE"],
    gameState: allTrue,
    states: [goodState("CA", "US"), goodState("BY", "DE")],
    seatRequirements: [
      { countryId: "US", field: "houseDistricts", level: "present", source: "test" },
      { countryId: "DE", field: "stateSenateSeats", level: "positive", source: "test" },
    ],
    legacy: {
      charactersLegacyApprovals: 0,
      nppsLegacyApprovals: 0,
      legislationTypesLegacyApprovals: 0,
    },
    priceIndexCountries: [],
    ...overrides,
  };
}

const failures = (i: PreflightInput) =>
  evaluatePreflight(i).filter((finding) => finding.severity === "fail");

describe("evaluatePreflight", () => {
  it("passes a clean world", () => {
    expect(evaluatePreflight(input())).toEqual([]);
  });

  it("fails a removed flag that is explicitly false", () => {
    const found = failures(input({ gameState: { ...allTrue, coldWarEnabled: false } }));
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain("coldWarEnabled");
  });

  it("warns, not fails, on absent flags in the running world and stays quiet in a fresh one", () => {
    const { macroGrowthV1: _dropped, ...rest } = allTrue;
    void _dropped;
    const running = evaluatePreflight(input({ gameState: rest }));
    expect(running.map((f) => f.severity)).toEqual(["warn"]);
    expect(evaluatePreflight(input({ gameState: rest, mode: "fresh" }))).toEqual([]);
  });

  it("warns when NPP autonomy is below v5", () => {
    const found = evaluatePreflight(input({ gameState: { ...allTrue, nppAutonomyLevel: "v4" } }));
    expect(found.map((f) => [f.severity, f.check])).toEqual([["warn", "npp-autonomy-level"]]);
    const unset = evaluatePreflight(
      input({ gameState: { ...allTrue, nppAutonomyLevel: undefined } })
    );
    expect(unset[0].detail).toContain("unset");
  });

  it("fails a fresh-world-only flag that is on in the running world", () => {
    const found = failures(input({ gameState: { ...allTrue, nppTurnoverEnabled: true } }));
    expect(found.map((f) => f.check)).toEqual(["fresh-world-only-flags"]);
  });

  it("fails when the gameState document is missing", () => {
    expect(failures(input({ gameState: null })).map((f) => f.check)).toEqual(["removed-flags"]);
  });

  it("fails states with non-positive or missing gdp and population", () => {
    const found = failures(
      input({
        states: [
          goodState("CA", "US", { gdp: 0 }),
          goodState("TX", "US", { population: undefined }),
          goodState("BY", "DE", { gdp: Number.NaN }),
        ],
      })
    );
    expect(found.map((f) => f.detail)).toEqual([
      expect.stringContaining("US: 1 of 2 state(s) without positive gdp, e.g. CA"),
      expect.stringContaining("US: 1 of 2 state(s) without positive population, e.g. TX"),
      expect.stringContaining("DE: 1 of 1 state(s) without positive gdp"),
    ]);
  });

  it("fails a country with no state documents", () => {
    const found = failures(input({ states: [goodState("CA", "US")] }));
    expect(found[0].detail).toBe("DE has no state documents");
  });

  it("requires a positive seat field where the spawner throws, and allows zero where it may", () => {
    const zeroed = [
      goodState("CA", "US"),
      goodState("DC", "US", { houseDistricts: 0 }),
      goodState("BY", "DE", { stateSenateSeats: 0 }),
    ];
    const found = failures(input({ states: zeroed }));
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain("DE.stateSenateSeats");
  });

  it("fails a present-level seat field that is absent or sums to zero", () => {
    const missing = failures(
      input({
        states: [goodState("CA", "US", { houseDistricts: undefined }), goodState("BY", "DE")],
      })
    );
    expect(missing[0].detail).toContain("US.houseDistricts missing or not a number");
    const zero = failures(
      input({ states: [goodState("CA", "US", { houseDistricts: 0 }), goodState("BY", "DE")] })
    );
    expect(zero[0].detail).toContain("totals zero");
  });

  it("ignores seat requirements for countries outside the checked set", () => {
    const found = failures(input({ countries: ["US"], states: [goodState("CA", "US")] }));
    expect(found).toEqual([]);
  });

  it("treats legacy fields as moot before a reset and as failures in a fresh world", () => {
    const legacy = {
      charactersLegacyApprovals: 4,
      nppsLegacyApprovals: 2,
      legislationTypesLegacyApprovals: 1,
    };
    const before = evaluatePreflight(input({ legacy }));
    expect(before.map((f) => f.severity)).toEqual(["warn", "warn", "warn"]);
    const after = evaluatePreflight(input({ legacy, mode: "fresh" }));
    expect(after.map((f) => f.severity)).toEqual(["fail", "fail", "fail"]);
  });

  it("fails when a stored priceIndex exists", () => {
    const found = failures(input({ priceIndexCountries: ["US", "UK"] }));
    expect(found.map((f) => f.check)).toEqual(["price-index"]);
  });
});
