import { describe, expect, it } from "vitest";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { abRegions } from "@/lib/countries/ab/data/abRegions";
import { expandToSubRegions } from "./expandToSubRegions";

function seedCanada() {
  const ages = Array.from({ length: 101 }, () => 1_000);
  return makeStrictInMemoryStore({
    states: [
      {
        _id: "CA_AB",
        countryId: "CA",
        regionType: "province",
        name: "Alberta",
        population: 5_100_000,
        gdp: 552_000,
        houseDistricts: 37,
        stateSenateSeats: 6,
      },
      { _id: "CA_ON", countryId: "CA", regionType: "province", population: 16_300_000, gdp: 1 },
    ],
    counties: [{ _id: "c1", countryId: "CA", stateId: "CA_AB" }],
    macroMetrics: [{ _id: "CA_AB", countryId: "CA", approval: 44 }],
    regionDemographics: [{ _id: "CA_AB", countryId: "CA", ages: { male: ages, female: ages } }],
    stateRegistrationPool: [
      { _id: "CA_CA_AB", countryId: "CA", stateId: "CA_AB", independent: 40, unregistered: 10 },
    ],
    corporateSectors: Array.from({ length: 4 }, (_, i) => ({
      _id: `s${i}`,
      countryId: "CA",
      stateId: "CA_AB",
      revenue: 100,
    })),
    characters: [{ _id: "voter", countryId: "CA", homeState: "CA_AB" }],
  });
}

describe("Alberta expands out of Canada's CA_AB province", () => {
  it("stands up the six Alberta regions and retires the province", async () => {
    const { db, cols } = seedCanada();
    const res = await expandToSubRegions(db, "AB");

    expect(res.inserted).toBe(6);
    const regions = cols.states.filter((s) => s.countryId === "AB");
    expect(regions.map((s) => s._id).sort()).toEqual(abRegions.map((s) => s._id).sort());
    expect(cols.states.find((s) => s._id === "CA_AB")).toBeUndefined();
    expect(cols.states.find((s) => s._id === "CA_ON")).toMatchObject({ countryId: "CA" });

    const total = (key: "population" | "houseDistricts") =>
      regions.reduce((sum, s) => sum + Number(s[key]), 0);
    expect(total("population")).toBe(5_100_000);
    expect(total("houseDistricts")).toBe(87);
    expect(regions.reduce((sum, s) => sum + Number(s.gdp), 0)).toBeCloseTo(552_000, 3);
  });

  it("moves Alberta's records, residents and sectors onto the new country", async () => {
    const { db, cols } = seedCanada();
    await expandToSubRegions(db, "AB");

    expect(cols.counties).toHaveLength(0);
    expect(cols.macroMetrics.map((m) => m._id).sort()).toEqual(abRegions.map((s) => s._id).sort());
    expect(cols.stateRegistrationPool.every((p) => p.countryId === "AB")).toBe(true);
    expect(cols.stateRegistrationPool.some((p) => p._id === "CA_CA_AB")).toBe(false);
    expect(cols.corporateSectors.every((s) => s.countryId === "AB")).toBe(true);
    expect(cols.characters[0]).toMatchObject({ countryId: "AB", homeState: "AB_EDM" });
  });

  it("does nothing the second time", async () => {
    const { db } = seedCanada();
    await expandToSubRegions(db, "AB");
    expect(await expandToSubRegions(db, "AB")).toMatchObject({
      inserted: 0,
      skipped: "already-expanded",
    });
  });
});
