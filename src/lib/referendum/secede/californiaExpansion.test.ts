import { describe, expect, it } from "vitest";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { rcaRegions } from "@/lib/countries/rca/data/rcaRegions";
import { expandToSubRegions } from "./expandToSubRegions";

function seedUnitedStates() {
  const ages = Array.from({ length: 101 }, () => 1_000);
  return makeStrictInMemoryStore({
    states: [
      {
        _id: "CA",
        countryId: "US",
        regionType: "state",
        name: "California",
        population: 39_355_309,
        gdp: 4_250_800,
        houseDistricts: 52,
        stateSenateSeats: 40,
      },
      { _id: "NY", countryId: "US", regionType: "state", population: 20_000_000, gdp: 1 },
    ],
    counties: [{ _id: "c1", countryId: "US", stateId: "CA" }],
    macroMetrics: [{ _id: "CA", countryId: "US", approval: 44 }],
    regionDemographics: [{ _id: "CA", countryId: "US", ages: { male: ages, female: ages } }],
    stateRegistrationPool: [
      { _id: "US_CA", countryId: "US", stateId: "CA", independent: 40, unregistered: 10 },
    ],
    corporateSectors: Array.from({ length: 4 }, (_, i) => ({
      _id: `s${i}`,
      countryId: "US",
      stateId: "CA",
      revenue: 100,
    })),
    characters: [{ _id: "voter", countryId: "US", homeState: "CA" }],
  });
}

describe("California expands out of the US CA state", () => {
  it("stands up the six California regions and retires the state", async () => {
    const { db, cols } = seedUnitedStates();
    const res = await expandToSubRegions(db, "RCA");

    expect(res.inserted).toBe(6);
    const regions = cols.states.filter((s) => s.countryId === "RCA");
    expect(regions.map((s) => s._id).sort()).toEqual(rcaRegions.map((s) => s._id).sort());
    expect(cols.states.find((s) => s._id === "CA")).toBeUndefined();
    expect(cols.states.find((s) => s._id === "NY")).toMatchObject({ countryId: "US" });

    const total = (key: "population" | "houseDistricts") =>
      regions.reduce((sum, s) => sum + Number(s[key]), 0);
    expect(total("population")).toBe(39_355_309);
    expect(total("houseDistricts")).toBe(80);
    expect(regions.reduce((sum, s) => sum + Number(s.gdp), 0)).toBeCloseTo(4_250_800, 3);
  });

  it("moves California's records, residents and sectors onto the new country", async () => {
    const { db, cols } = seedUnitedStates();
    await expandToSubRegions(db, "RCA");

    expect(cols.counties).toHaveLength(0);
    expect(cols.macroMetrics.map((m) => m._id).sort()).toEqual(rcaRegions.map((s) => s._id).sort());
    expect(cols.stateRegistrationPool.every((p) => p.countryId === "RCA")).toBe(true);
    expect(cols.stateRegistrationPool.some((p) => p._id === "US_CA")).toBe(false);
    expect(cols.corporateSectors.every((s) => s.countryId === "RCA")).toBe(true);
    expect(cols.characters[0]).toMatchObject({ countryId: "RCA", homeState: "RCA_NOR" });
  });

  it("does nothing the second time", async () => {
    const { db } = seedUnitedStates();
    await expandToSubRegions(db, "RCA");
    expect(await expandToSubRegions(db, "RCA")).toMatchObject({
      inserted: 0,
      skipped: "already-expanded",
    });
  });
});
