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
import { qcRegions } from "@/lib/countries/qc/data/qcRegions";
import { secedeRegion } from "./secedeRegion";

function seedCanada() {
  const ages = Array.from({ length: 101 }, () => 1_000);
  return makeStrictInMemoryStore({
    states: [
      {
        _id: "CA_QC",
        countryId: "CA",
        regionType: "province",
        population: 9_120_000,
        gdp: 679_650,
        houseDistricts: 78,
      },
      { _id: "CA_ON", countryId: "CA", regionType: "province", population: 16_300_000, gdp: 1 },
    ],
    macroMetrics: [{ _id: "CA_QC", countryId: "CA", approval: 44 }],
    regionDemographics: [{ _id: "CA_QC", countryId: "CA", ages: { male: ages, female: ages } }],
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
        name: "Federal Unity Party",
        abbreviation: "FUP",
      },
      {
        _id: "al",
        sequentialId: 4,
        countryId: "CA",
        name: "Laurentian Alliance",
        abbreviation: "AL",
      },
    ],
    electedOfficials: [
      { _id: "mpAL", countryId: "CA", officeType: "caCommons", state: "CA_QC", party: "4" },
      { _id: "mpFUP", countryId: "CA", officeType: "caCommons", state: "CA_QC", party: "1" },
      { _id: "mpON", countryId: "CA", officeType: "caCommons", state: "CA_ON", party: "1" },
      {
        _id: "premier",
        countryId: "CA",
        officeType: "governor",
        state: "CA_QC",
        party: "4",
        characterId: "premierChar",
      },
    ],
    statePartyOrg: [
      { _id: "CA_CA_QC_4", countryId: "CA", stateId: "CA_QC", partyId: "4", organization: 60 },
      { _id: "CA_CA_QC_1", countryId: "CA", stateId: "CA_QC", partyId: "1", organization: 50 },
      { _id: "CA_CA_ON_1", countryId: "CA", stateId: "CA_ON", partyId: "1", organization: 70 },
    ],
    characters: [
      { _id: "voter", homeState: "CA_QC", countryId: "CA", party: "4" },
      { _id: "premierChar", homeState: "CA_QC", countryId: "CA", party: "4" },
    ],
  });
}

describe("Quebec secedes from Canada", () => {
  it("stands Quebec up as a country with its own parties, Premier and elections", async () => {
    const { db, cols } = seedCanada();
    const res = await secedeRegion(db, { regionId: "CA_QC", fromCountryId: "CA", currentTurn: 50 });

    expect(res.ok).toBe(true);
    expect(cols.countryGameStates.find((c) => c._id === "QC")).toMatchObject({
      status: "active",
    });
    expect(
      cols.states
        .filter((s) => s.countryId === "QC")
        .map((s) => s._id)
        .sort()
    ).toEqual(qcRegions.map((s) => s._id).sort());
    expect(cols.states.find((s) => s._id === "CA_QC")).toBeUndefined();
    expect(cols.federalBudget.find((b) => b._id === "QC")).toMatchObject({ currencyCode: "CAD" });

    // The Quebec-only party carries over; the Canada-wide one stays in Canada.
    expect(cols.politicalParties.find((p) => p._id === "al")).toMatchObject({ countryId: "QC" });
    expect(cols.politicalParties.find((p) => p._id === "fup")).toMatchObject({ countryId: "CA" });

    // Quebec's MPs leave the Commons; Ontario's stay; the Premier leads as caretaker.
    expect(cols.electedOfficials.some((o) => o._id === "mpAL" || o._id === "mpFUP")).toBe(false);
    expect(cols.electedOfficials.find((o) => o._id === "mpON")).toBeDefined();
    expect(cols.electedOfficials.find((o) => o._id === "premier")).toMatchObject({
      countryId: "QC",
      officeType: "firstMinister",
      state: "QC_CAP",
    });

    // First Assembly, prefect and council races open in every region.
    expect(cols.elections).toHaveLength(qcRegions.length * 3);
    expect(cols.elections.filter((row) => row.electionType === "snap_qcAssembly")).toHaveLength(
      qcRegions.length
    );
    expect(cols.characters.find((c) => c._id === "voter")).toMatchObject({
      countryId: "QC",
      homeState: "QC_CAP",
    });
  });
});
