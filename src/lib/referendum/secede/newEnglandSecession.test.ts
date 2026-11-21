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
import { nenRegions } from "@/lib/countries/nen/data/nenRegions";
import { secedeRegion } from "./secedeRegion";

const MEMBERS = nenRegions.map((region) => region._id);

function seedUnitedStates() {
  return makeStrictInMemoryStore({
    states: [
      ...nenRegions.map((region) => ({
        _id: region._id,
        countryId: "US",
        regionType: "state",
        name: region.name,
        population: region.population,
        gdp: region.gdp,
        houseDistricts: 1,
        stateSenateSeats: 30,
      })),
      { _id: "NY", countryId: "US", regionType: "state", population: 20_000_000, gdp: 1_500_000 },
    ],
    macroMetrics: [...MEMBERS, "NY"].map((id) => ({ _id: id, countryId: "US", approval: 44 })),
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
        _id: "nei",
        sequentialId: 7,
        countryId: "US",
        name: "New England Independence Party",
        abbreviation: "NEI",
      },
    ],
    electedOfficials: [
      ...MEMBERS.flatMap((id) => [
        { _id: `house-${id}`, countryId: "US", officeType: "house", state: id, party: "1" },
        { _id: `senate-${id}`, countryId: "US", officeType: "senate", state: id, party: "1" },
        {
          _id: `gov-${id}`,
          countryId: "US",
          officeType: "governor",
          state: id,
          party: id === "MA" ? "7" : "1",
          characterId: `char-${id}`,
          characterName: `Governor of ${id}`,
        },
      ]),
      { _id: "houseNY", countryId: "US", officeType: "house", state: "NY", party: "1" },
    ],
    statePartyOrg: [
      ...MEMBERS.map((id) => ({
        _id: `US_${id}_7`,
        countryId: "US",
        stateId: id,
        partyId: "7",
        organization: 60,
      })),
      { _id: "US_NY_1", countryId: "US", stateId: "NY", partyId: "1", organization: 70 },
    ],
    characters: [
      ...MEMBERS.map((id) => ({ _id: `char-${id}`, homeState: id, countryId: "US", party: "1" })),
      { _id: "resident", homeState: "CT", countryId: "US", party: "7" },
      { _id: "newYorker", homeState: "NY", countryId: "US", party: "1" },
    ],
  });
}

describe("New England secedes from the United States as one country", () => {
  it("moves all six states to NEN with their ids, population and GDP intact", async () => {
    const { db, cols } = seedUnitedStates();
    const res = await secedeRegion(db, {
      regionId: "NE_BLOC",
      fromCountryId: "US",
      currentTurn: 50,
    });

    expect(res.ok).toBe(true);
    expect(cols.countryGameStates.find((c) => c._id === "NEN")).toMatchObject({
      status: "active",
    });
    const moved = cols.states.filter((s) => s.countryId === "NEN");
    expect(moved.map((s) => s._id).sort()).toEqual([...MEMBERS].sort());
    expect(moved.reduce((sum, s) => sum + Number(s.population), 0)).toBe(
      nenRegions.reduce((sum, s) => sum + s.population, 0)
    );
    expect(moved.reduce((sum, s) => sum + Number(s.gdp), 0)).toBe(
      nenRegions.reduce((sum, s) => sum + (s.gdp ?? 0), 0)
    );
    expect(moved.reduce((sum, s) => sum + Number(s.houseDistricts), 0)).toBe(90);
    expect(cols.states.find((s) => s._id === "NY")).toMatchObject({ countryId: "US" });
    for (const id of MEMBERS)
      expect(cols.macroMetrics.find((m) => m._id === id)).toMatchObject({ countryId: "NEN" });
    expect(cols.macroMetrics.find((m) => m._id === "NY")).toMatchObject({ countryId: "US" });
  });

  it("splits the national budget by GDP share and keeps the party that lives only in the bloc", async () => {
    const { db, cols } = seedUnitedStates();
    await secedeRegion(db, { regionId: "NE_BLOC", fromCountryId: "US", currentTurn: 50 });

    const nen = cols.federalBudget.find((b) => b._id === "NEN");
    const us = cols.federalBudget.find((b) => b._id === "US");
    expect(nen).toMatchObject({ currencyCode: "USD" });
    expect(Number(nen?.gdp) + Number(us?.gdp)).toBeCloseTo(1000, 6);
    expect(cols.politicalParties.find((p) => p._id === "nei")).toMatchObject({
      countryId: "NEN",
    });
    expect(cols.politicalParties.find((p) => p._id === "dem")).toMatchObject({ countryId: "US" });
    const orgs = cols.statePartyOrg.filter((o) => o.countryId === "NEN");
    expect(orgs.map((o) => o.stateId).sort()).toEqual([...MEMBERS].sort());
  });

  it("removes the six states' seats from Congress and leads with the largest state's Governor", async () => {
    const { db, cols } = seedUnitedStates();
    await secedeRegion(db, { regionId: "NE_BLOC", fromCountryId: "US", currentTurn: 50 });

    for (const id of MEMBERS) {
      expect(cols.electedOfficials.some((o) => o._id === `house-${id}`)).toBe(false);
      expect(cols.electedOfficials.some((o) => o._id === `senate-${id}`)).toBe(false);
    }
    expect(cols.electedOfficials.find((o) => o._id === "houseNY")).toBeDefined();
    expect(cols.electedOfficials.find((o) => o._id === "gov-MA")).toMatchObject({
      countryId: "NEN",
      officeType: "firstMinister",
      state: "MA",
    });
    // The other five Governors stay in office as regional executives.
    for (const id of MEMBERS.filter((member) => member !== "MA"))
      expect(cols.electedOfficials.find((o) => o._id === `gov-${id}`)).toMatchObject({
        officeType: "governor",
        state: id,
      });
  });

  it("opens first elections in all six regions and re-homes residents", async () => {
    const { db, cols } = seedUnitedStates();
    await secedeRegion(db, { regionId: "NE_BLOC", fromCountryId: "US", currentTurn: 50 });

    expect(cols.elections).toHaveLength(MEMBERS.length * 3);
    expect(cols.elections.filter((row) => row.electionType === "snap_nenAssembly")).toHaveLength(
      MEMBERS.length
    );
    expect(cols.characters.find((c) => c._id === "resident")).toMatchObject({
      countryId: "NEN",
      homeState: "CT",
    });
    expect(cols.characters.find((c) => c._id === "newYorker")).toMatchObject({ countryId: "US" });
  });

  it("is a no-op the second time", async () => {
    const { db } = seedUnitedStates();
    await secedeRegion(db, { regionId: "NE_BLOC", fromCountryId: "US", currentTurn: 50 });
    const again = await secedeRegion(db, {
      regionId: "NE_BLOC",
      fromCountryId: "US",
      currentTurn: 51,
    });
    expect(again).toMatchObject({ ok: true, skipped: "already-seceded" });
  });
});
