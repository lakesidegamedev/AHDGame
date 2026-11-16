vi.mock("@/lib/referendum/refundConversionConstruction", () => ({
  refundConversionConstruction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/turn/parliamentaryGovernment", () => ({
  updateParliamentaryGovernmentSeats: vi.fn(),
  ensureParliamentaryGovernmentFormation: vi.fn(),
  unformGovernmentAndVacatePM: vi.fn(),
}));
vi.mock("@/lib/db/sessionDb", () => ({
  boundSession: () => undefined,
  unboundDb: (db: unknown) => db,
  withSessionDb: (_db: unknown, work: (db: unknown) => Promise<unknown>) => work(_db),
  afterCommit: (_db: unknown, effect: () => Promise<unknown>) => effect(),
}));
vi.mock("@/lib/nationalMetrics", () => ({
  computeNationalMetrics: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/turn/history/recordCountryEvent", () => ({
  recordCountryEvent: vi.fn().mockResolvedValue(undefined),
}));

import { describe, expect, it, vi } from "vitest";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { rtxRegions } from "@/lib/countries/rtx/data/rtxRegions";
import { secedeRegion } from "./secedeRegion";

function seedUnitedStates() {
  const ages = Array.from({ length: 101 }, () => 1_000);
  return makeStrictInMemoryStore({
    states: [
      {
        _id: "TX",
        countryId: "US",
        regionType: "state",
        population: 31_709_821,
        gdp: 2_904_400,
        houseDistricts: 38,
      },
      { _id: "NY", countryId: "US", regionType: "state", population: 20_000_000, gdp: 1 },
    ],
    macroMetrics: [{ _id: "TX", countryId: "US", approval: 44 }],
    regionDemographics: [{ _id: "TX", countryId: "US", ages: { male: ages, female: ages } }],
    federalBudget: [
      {
        _id: "US",
        countryId: "US",
        taxBases: { income: 1000 },
        treasuryBalance: -500,
        debt: { principal: 500, interestRate: 3 },
        gdp: 1000,
        currencyCode: "USD",
      },
    ],
    politicalParties: [
      {
        _id: "dem",
        sequentialId: 1,
        countryId: "US",
        name: "Democratic Party",
        abbreviation: "DEM",
      },
      {
        _id: "lsi",
        sequentialId: 4,
        countryId: "US",
        name: "Lone Star Independence Party",
        abbreviation: "LSI",
      },
    ],
    electedOfficials: [
      { _id: "repLSI", countryId: "US", officeType: "house", state: "TX", party: "4" },
      { _id: "repDEM", countryId: "US", officeType: "house", state: "TX", party: "1" },
      { _id: "senTX", countryId: "US", officeType: "senate", state: "TX", party: "1" },
      { _id: "repNY", countryId: "US", officeType: "house", state: "NY", party: "1" },
      {
        _id: "governor",
        countryId: "US",
        officeType: "governor",
        state: "TX",
        party: "4",
        characterId: "governorChar",
      },
    ],
    statePartyOrg: [
      { _id: "US_TX_4", countryId: "US", stateId: "TX", partyId: "4", organization: 60 },
      { _id: "US_TX_1", countryId: "US", stateId: "TX", partyId: "1", organization: 50 },
      { _id: "US_NY_1", countryId: "US", stateId: "NY", partyId: "1", organization: 70 },
    ],
    characters: [
      { _id: "voter", homeState: "TX", countryId: "US", party: "4" },
      { _id: "governorChar", homeState: "TX", countryId: "US", party: "4" },
    ],
  });
}

describe("Texas secedes from the United States", () => {
  it("stands Texas up as a country with its own parties, Chief Minister and elections", async () => {
    const { db, cols } = seedUnitedStates();
    const res = await secedeRegion(db, { regionId: "TX", fromCountryId: "US", currentTurn: 50 });

    expect(res.ok).toBe(true);
    expect(cols.countryGameStates.find((c) => c._id === "RTX")).toMatchObject({
      status: "active",
    });
    expect(
      cols.states
        .filter((s) => s.countryId === "RTX")
        .map((s) => s._id)
        .sort()
    ).toEqual(rtxRegions.map((s) => s._id).sort());
    expect(cols.states.find((s) => s._id === "TX")).toBeUndefined();
    expect(cols.federalBudget.find((b) => b._id === "RTX")).toMatchObject({ currencyCode: "USD" });

    // The Texas-only party carries over; the national one stays in the US.
    expect(cols.politicalParties.find((p) => p._id === "lsi")).toMatchObject({ countryId: "RTX" });
    expect(cols.politicalParties.find((p) => p._id === "dem")).toMatchObject({ countryId: "US" });

    // Texas's House members and senators leave Congress; New York's stay; the Governor leads as caretaker.
    for (const id of ["repLSI", "repDEM", "senTX"]) {
      expect(cols.electedOfficials.some((o) => o._id === id)).toBe(false);
    }
    expect(cols.electedOfficials.find((o) => o._id === "repNY")).toBeDefined();
    expect(cols.electedOfficials.find((o) => o._id === "governor")).toMatchObject({
      countryId: "RTX",
      officeType: "firstMinister",
      state: "RTX_CEN",
    });

    // First House, commissioner and council races open in every region.
    expect(cols.elections).toHaveLength(rtxRegions.length * 3);
    expect(cols.elections.filter((row) => row.electionType === "snap_rtxAssembly")).toHaveLength(
      rtxRegions.length
    );
    expect(cols.characters.find((c) => c._id === "voter")).toMatchObject({
      countryId: "RTX",
      homeState: "RTX_CEN",
    });
  });
});
