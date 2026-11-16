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
import { abRegions } from "@/lib/countries/ab/data/abRegions";
import { secedeRegion } from "./secedeRegion";

function seedCanada() {
  const ages = Array.from({ length: 101 }, () => 1_000);
  return makeStrictInMemoryStore({
    states: [
      {
        _id: "CA_AB",
        countryId: "CA",
        regionType: "province",
        population: 5_100_000,
        gdp: 552_000,
        houseDistricts: 37,
      },
      { _id: "CA_ON", countryId: "CA", regionType: "province", population: 16_300_000, gdp: 1 },
    ],
    macroMetrics: [{ _id: "CA_AB", countryId: "CA", approval: 44 }],
    regionDemographics: [{ _id: "CA_AB", countryId: "CA", ages: { male: ages, female: ages } }],
    federalBudget: [
      {
        _id: "CA",
        countryId: "CA",
        taxBases: { income: 1000 },
        treasuryBalance: -500,
        debt: { principal: 500, interestRate: 3 },
        gdp: 1000,
        currencyCode: "CAD",
      },
    ],
    politicalParties: [
      {
        _id: "fup",
        sequentialId: 1,
        countryId: "CA",
        name: "Liberal Party of Canada",
        abbreviation: "LIB",
      },
      {
        _id: "al",
        sequentialId: 4,
        countryId: "CA",
        name: "Alberta Sovereignty Party",
        abbreviation: "ASP",
      },
    ],
    electedOfficials: [
      { _id: "mpAL", countryId: "CA", officeType: "caCommons", state: "CA_AB", party: "4" },
      { _id: "mpFUP", countryId: "CA", officeType: "caCommons", state: "CA_AB", party: "1" },
      { _id: "mpON", countryId: "CA", officeType: "caCommons", state: "CA_ON", party: "1" },
      {
        _id: "premier",
        countryId: "CA",
        officeType: "governor",
        state: "CA_AB",
        party: "4",
        characterId: "premierChar",
      },
    ],
    statePartyOrg: [
      { _id: "CA_CA_AB_4", countryId: "CA", stateId: "CA_AB", partyId: "4", organization: 60 },
      { _id: "CA_CA_AB_1", countryId: "CA", stateId: "CA_AB", partyId: "1", organization: 50 },
      { _id: "CA_CA_ON_1", countryId: "CA", stateId: "CA_ON", partyId: "1", organization: 70 },
    ],
    characters: [
      { _id: "voter", homeState: "CA_AB", countryId: "CA", party: "4" },
      { _id: "premierChar", homeState: "CA_AB", countryId: "CA", party: "4" },
    ],
  });
}

describe("Alberta secedes from Canada", () => {
  it("stands Alberta up as a country with its own parties, Premier and elections", async () => {
    const { db, cols } = seedCanada();
    const res = await secedeRegion(db, { regionId: "CA_AB", fromCountryId: "CA", currentTurn: 50 });

    expect(res.ok).toBe(true);
    expect(cols.countryGameStates.find((c) => c._id === "AB")).toMatchObject({
      status: "active",
    });
    expect(
      cols.states
        .filter((s) => s.countryId === "AB")
        .map((s) => s._id)
        .sort()
    ).toEqual(abRegions.map((s) => s._id).sort());
    expect(cols.states.find((s) => s._id === "CA_AB")).toBeUndefined();
    expect(cols.federalBudget.find((b) => b._id === "AB")).toMatchObject({ currencyCode: "CAD" });

    // The Alberta-only party carries over; the Canada-wide one stays in Canada.
    expect(cols.politicalParties.find((p) => p._id === "al")).toMatchObject({ countryId: "AB" });
    expect(cols.politicalParties.find((p) => p._id === "fup")).toMatchObject({ countryId: "CA" });

    // Alberta's MPs leave the Commons; Ontario's stay; the Premier leads as caretaker.
    expect(cols.electedOfficials.some((o) => o._id === "mpAL" || o._id === "mpFUP")).toBe(false);
    expect(cols.electedOfficials.find((o) => o._id === "mpON")).toBeDefined();
    expect(cols.electedOfficials.find((o) => o._id === "premier")).toMatchObject({
      countryId: "AB",
      officeType: "firstMinister",
      state: "AB_EDM",
    });

    // First Assembly, prefect and council races open in every region.
    expect(cols.elections).toHaveLength(abRegions.length * 3);
    expect(cols.elections.filter((row) => row.electionType === "snap_abAssembly")).toHaveLength(
      abRegions.length
    );
    expect(cols.characters.find((c) => c._id === "voter")).toMatchObject({
      countryId: "AB",
      homeState: "AB_EDM",
    });
  });
});
