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
import { rcaRegions } from "@/lib/countries/rca/data/rcaRegions";
import { secedeRegion } from "./secedeRegion";

function seedUnitedStates() {
  const ages = Array.from({ length: 101 }, () => 1_000);
  return makeStrictInMemoryStore({
    states: [
      {
        _id: "CA",
        countryId: "US",
        regionType: "state",
        population: 39_355_309,
        gdp: 4_250_800,
        houseDistricts: 52,
      },
      { _id: "NY", countryId: "US", regionType: "state", population: 20_000_000, gdp: 1 },
    ],
    macroMetrics: [{ _id: "CA", countryId: "US", approval: 44 }],
    regionDemographics: [{ _id: "CA", countryId: "US", ages: { male: ages, female: ages } }],
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
        _id: "bfi",
        sequentialId: 4,
        countryId: "US",
        name: "Bear Flag Independence Party",
        abbreviation: "BFI",
      },
    ],
    electedOfficials: [
      { _id: "repBFI", countryId: "US", officeType: "house", state: "CA", party: "4" },
      { _id: "repDEM", countryId: "US", officeType: "house", state: "CA", party: "1" },
      { _id: "senCA", countryId: "US", officeType: "senate", state: "CA", party: "1" },
      { _id: "repNY", countryId: "US", officeType: "house", state: "NY", party: "1" },
      {
        _id: "governor",
        countryId: "US",
        officeType: "governor",
        state: "CA",
        party: "4",
        characterId: "governorChar",
      },
    ],
    statePartyOrg: [
      { _id: "US_CA_4", countryId: "US", stateId: "CA", partyId: "4", organization: 60 },
      { _id: "US_CA_1", countryId: "US", stateId: "CA", partyId: "1", organization: 50 },
      { _id: "US_NY_1", countryId: "US", stateId: "NY", partyId: "1", organization: 70 },
    ],
    characters: [
      { _id: "voter", homeState: "CA", countryId: "US", party: "4" },
      { _id: "governorChar", homeState: "CA", countryId: "US", party: "4" },
    ],
  });
}

describe("California secedes from the United States", () => {
  it("stands California up as a country with its own parties, Premier and elections", async () => {
    const { db, cols } = seedUnitedStates();
    const res = await secedeRegion(db, { regionId: "CA", fromCountryId: "US", currentTurn: 50 });

    expect(res.ok).toBe(true);
    expect(cols.countryGameStates.find((c) => c._id === "RCA")).toMatchObject({
      status: "active",
    });
    expect(
      cols.states
        .filter((s) => s.countryId === "RCA")
        .map((s) => s._id)
        .sort()
    ).toEqual(rcaRegions.map((s) => s._id).sort());
    expect(cols.states.find((s) => s._id === "CA")).toBeUndefined();
    expect(cols.federalBudget.find((b) => b._id === "RCA")).toMatchObject({ currencyCode: "USD" });

    // The California-only party carries over; the national one stays in the US.
    expect(cols.politicalParties.find((p) => p._id === "bfi")).toMatchObject({ countryId: "RCA" });
    expect(cols.politicalParties.find((p) => p._id === "dem")).toMatchObject({ countryId: "US" });

    // California's House members and senators leave Congress; New York's stay; the Governor leads as caretaker.
    for (const id of ["repBFI", "repDEM", "senCA"]) {
      expect(cols.electedOfficials.some((o) => o._id === id)).toBe(false);
    }
    expect(cols.electedOfficials.find((o) => o._id === "repNY")).toBeDefined();
    expect(cols.electedOfficials.find((o) => o._id === "governor")).toMatchObject({
      countryId: "RCA",
      officeType: "firstMinister",
      state: "RCA_NOR",
    });

    // First House, commissioner and council races open in every region.
    expect(cols.elections).toHaveLength(rcaRegions.length * 3);
    expect(cols.elections.filter((row) => row.electionType === "snap_rcaAssembly")).toHaveLength(
      rcaRegions.length
    );
    expect(cols.characters.find((c) => c._id === "voter")).toMatchObject({
      countryId: "RCA",
      homeState: "RCA_NOR",
    });
  });
});
