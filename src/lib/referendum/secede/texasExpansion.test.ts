import { describe, expect, it } from "vitest";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { rtxRegions } from "@/lib/countries/rtx/data/rtxRegions";
import { expandToSubRegions } from "./expandToSubRegions";

function seedUnitedStates() {
  const ages = Array.from({ length: 101 }, () => 1_000);
  return makeStrictInMemoryStore({
    states: [
      {
        _id: "TX",
        countryId: "US",
        regionType: "state",
        name: "Texas",
        population: 31_709_821,
        gdp: 2_904_400,
        houseDistricts: 38,
        stateSenateSeats: 31,
      },
      { _id: "NY", countryId: "US", regionType: "state", population: 20_000_000, gdp: 1 },
    ],
    counties: [{ _id: "c1", countryId: "US", stateId: "TX" }],
    macroMetrics: [{ _id: "TX", countryId: "US", approval: 44 }],
    regionDemographics: [{ _id: "TX", countryId: "US", ages: { male: ages, female: ages } }],
    stateRegistrationPool: [
      { _id: "US_TX", countryId: "US", stateId: "TX", independent: 40, unregistered: 10 },
    ],
    corporateSectors: Array.from({ length: 4 }, (_, i) => ({
      _id: `s${i}`,
      countryId: "US",
      stateId: "TX",
      revenue: 100,
    })),
    characters: [{ _id: "voter", countryId: "US", homeState: "TX" }],
  });
}

describe("Texas expands out of the US TX state", () => {
  it("stands up the six Texas regions and retires the state", async () => {
    const { db, cols } = seedUnitedStates();
    const res = await expandToSubRegions(db, "RTX");

    expect(res.inserted).toBe(6);
    const regions = cols.states.filter((s) => s.countryId === "RTX");
    expect(regions.map((s) => s._id).sort()).toEqual(rtxRegions.map((s) => s._id).sort());
    expect(cols.states.find((s) => s._id === "TX")).toBeUndefined();
    expect(cols.states.find((s) => s._id === "NY")).toMatchObject({ countryId: "US" });

    const total = (key: "population" | "houseDistricts") =>
      regions.reduce((sum, s) => sum + Number(s[key]), 0);
    expect(total("population")).toBe(31_709_821);
    expect(total("houseDistricts")).toBe(150);
    expect(regions.reduce((sum, s) => sum + Number(s.gdp), 0)).toBeCloseTo(2_904_400, 3);
  });

  it("moves Texas's records, residents and sectors onto the new country", async () => {
    const { db, cols } = seedUnitedStates();
    await expandToSubRegions(db, "RTX");

    expect(cols.counties).toHaveLength(0);
    expect(cols.macroMetrics.map((m) => m._id).sort()).toEqual(rtxRegions.map((s) => s._id).sort());
    expect(cols.stateRegistrationPool.every((p) => p.countryId === "RTX")).toBe(true);
    expect(cols.stateRegistrationPool.some((p) => p._id === "US_TX")).toBe(false);
    expect(cols.corporateSectors.every((s) => s.countryId === "RTX")).toBe(true);
    expect(cols.characters[0]).toMatchObject({ countryId: "RTX", homeState: "RTX_CEN" });
  });

  it("does nothing the second time", async () => {
    const { db } = seedUnitedStates();
    await expandToSubRegions(db, "RTX");
    expect(await expandToSubRegions(db, "RTX")).toMatchObject({
      inserted: 0,
      skipped: "already-expanded",
    });
  });
});
