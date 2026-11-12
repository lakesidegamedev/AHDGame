import { describe, expect, it } from "vitest";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { qcRegions } from "@/lib/countries/qc/data/qcRegions";
import { expandToSubRegions } from "./expandToSubRegions";

function seedCanada() {
  const ages = Array.from({ length: 101 }, () => 1_000);
  return makeStrictInMemoryStore({
    states: [
      {
        _id: "CA_QC",
        countryId: "CA",
        regionType: "province",
        name: "Quebec",
        population: 9_120_000,
        gdp: 679_650,
        houseDistricts: 78,
        stateSenateSeats: 24,
      },
      { _id: "CA_ON", countryId: "CA", regionType: "province", population: 16_300_000, gdp: 1 },
    ],
    counties: [{ _id: "c1", countryId: "CA", stateId: "CA_QC" }],
    macroMetrics: [{ _id: "CA_QC", countryId: "CA", approval: 44 }],
    regionDemographics: [{ _id: "CA_QC", countryId: "CA", ages: { male: ages, female: ages } }],
    stateRegistrationPool: [
      { _id: "CA_CA_QC", countryId: "CA", stateId: "CA_QC", independent: 40, unregistered: 10 },
    ],
    corporateSectors: Array.from({ length: 4 }, (_, i) => ({
      _id: `s${i}`,
      countryId: "CA",
      stateId: "CA_QC",
      revenue: 100,
    })),
    characters: [{ _id: "voter", countryId: "CA", homeState: "CA_QC" }],
  });
}

describe("Quebec expands out of Canada's CA_QC province", () => {
  it("stands up the eight Quebec regions and retires the province", async () => {
    const { db, cols } = seedCanada();
    const res = await expandToSubRegions(db, "QC");

    expect(res.inserted).toBe(8);
    const regions = cols.states.filter((s) => s.countryId === "QC");
    expect(regions.map((s) => s._id).sort()).toEqual(qcRegions.map((s) => s._id).sort());
    expect(cols.states.find((s) => s._id === "CA_QC")).toBeUndefined();
    expect(cols.states.find((s) => s._id === "CA_ON")).toMatchObject({ countryId: "CA" });

    const total = (key: "population" | "houseDistricts") =>
      regions.reduce((sum, s) => sum + Number(s[key]), 0);
    expect(total("population")).toBe(9_120_000);
    expect(total("houseDistricts")).toBe(125);
    expect(regions.reduce((sum, s) => sum + Number(s.gdp), 0)).toBeCloseTo(679_650, 3);
  });

  it("moves Quebec's records, residents and sectors onto the new country", async () => {
    const { db, cols } = seedCanada();
    await expandToSubRegions(db, "QC");

    expect(cols.counties).toHaveLength(0);
    expect(cols.macroMetrics.map((m) => m._id).sort()).toEqual(qcRegions.map((s) => s._id).sort());
    expect(cols.stateRegistrationPool.every((p) => p.countryId === "QC")).toBe(true);
    expect(cols.stateRegistrationPool.some((p) => p._id === "CA_CA_QC")).toBe(false);
    expect(cols.corporateSectors.every((s) => s.countryId === "QC")).toBe(true);
    expect(cols.characters[0]).toMatchObject({ countryId: "QC", homeState: "QC_CAP" });
  });

  it("does nothing the second time", async () => {
    const { db } = seedCanada();
    await expandToSubRegions(db, "QC");
    expect(await expandToSubRegions(db, "QC")).toMatchObject({
      inserted: 0,
      skipped: "already-expanded",
    });
  });
});
