import { describe, expect, it } from "vitest";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import { BACKGROUND_CONSTITUTIONS } from "@/lib/world/macro/rules/backgroundConstitution";
import { initNationalPolitics } from "@/lib/world/macro/rules/nationalPolitics";
import {
  backgroundCountryRoute,
  buildBilateralTrade,
  buildEconomyView,
  buildPoliticsView,
  headlineTariff,
} from "./backgroundCountryView";

describe("backgroundCountryRoute", () => {
  it("renders the overview at the country root and for an unknown path", () => {
    expect(backgroundCountryRoute("/country/fr", "FR")).toEqual({ kind: "overview" });
    expect(backgroundCountryRoute("/country/fr/", "FR")).toEqual({ kind: "overview" });
    expect(backgroundCountryRoute(null, "FR")).toEqual({ kind: "overview" });
  });

  it("keeps the currency market and sends every full-simulation page to the overview", () => {
    expect(backgroundCountryRoute("/country/fr/forex", "FR")).toEqual({ kind: "subpage" });
    expect(backgroundCountryRoute("/country/fr/forex/eur", "FR")).toEqual({ kind: "subpage" });
    for (const sub of ["legislature", "map", "region/x", "parties", "elections", "budget"]) {
      expect(backgroundCountryRoute(`/country/fr/${sub}`, "FR")).toEqual({
        kind: "redirect",
        to: "/country/fr",
      });
    }
  });
});

describe("buildPoliticsView", () => {
  it("is null until the national politics model has run", () => {
    expect(buildPoliticsView(null)).toBeNull();
    expect(buildPoliticsView({ parties: [] })).toBeNull();
  });

  it("orders seated parties, names the government and drops folded parties", () => {
    const view = buildPoliticsView({
      parties: [
        { partyId: "a", name: "Alpha", seats: 40, voteShare: 0.3, economic: -2 },
        { partyId: "b", name: "Beta", seats: 60, voteShare: 0.4, economic: 2, color: "#123456" },
        { partyId: "c", name: "Gamma", seats: 0, voteShare: 0.01, active: false },
      ],
      governmentPartyIds: ["b"],
      head: { name: "Head", partyId: "b", sinceYear: 2027 },
      approval: 55,
      nextElectionTurn: 190,
      lastElection: { turn: 1, year: 2027, snap: false, governmentChanged: false },
    });
    expect(view?.parties.map((p) => p.party)).toEqual(["b", "a"]);
    expect(view?.totalSeats).toBe(100);
    expect(view?.governmentPartyNames).toEqual(["Beta"]);
    expect(view?.headPartyName).toBe("Beta");
    expect(view?.parties[0].inGovernment).toBe(true);
    expect(view?.parties[1].partyColor).toBe("#888888");
  });
});

describe("buildPoliticsView with the national politics model's own state", () => {
  it("reads the state the model writes", () => {
    const state = initNationalPolitics({
      constitution: BACKGROUND_CONSTITUTIONS.FR,
      parties: [
        {
          partyId: "l",
          name: "Left",
          abbreviation: "L",
          color: "#c00",
          economic: -3,
          social: -2,
          strength: 3,
        },
        {
          partyId: "c",
          name: "Centre",
          abbreviation: "C",
          color: "#fc0",
          economic: 0.5,
          social: 0,
          strength: 4,
        },
        {
          partyId: "r",
          name: "Right",
          abbreviation: "R",
          color: "#00c",
          economic: 3,
          social: 3,
          strength: 3,
        },
      ],
      turn: 1,
      year: 2027,
      turnsPerYear: 48,
      output: 1000,
      inflation: 2,
      expectations: { trendGrowth: 0.01, naturalUnemployment: 7 },
      namePool: { firstNames: ["Alex"], surnames: ["Durand"] },
      rng: makeSeededRng("page"),
    });
    const view = buildPoliticsView(state);
    expect(view).not.toBeNull();
    expect(view?.totalSeats).toBe(BACKGROUND_CONSTITUTIONS.FR.seats);
    expect(view?.headName).toBe(state?.head.name);
    expect(view?.governmentPartyNames.length).toBeGreaterThan(0);
    expect(view?.nextElectionTurn).toBe(state?.nextElectionTurn);
    expect(buildEconomyView({ budget: null, politicsEconomy: state?.economy }).unemployment).toBe(
      state?.economy.unemployment
    );
  });
});

describe("buildEconomyView", () => {
  it("prefers the national politics reading and falls back to the budget", () => {
    const budget = {
      gdp: 1_000,
      debtToGdpRatio: 0.85,
      creditRating: "A",
      economicFactors: { gdpGrowth: 1.5, inflationRate: 2.5 },
    };
    expect(buildEconomyView({ budget })).toMatchObject({
      gdp: 1_000,
      growth: 1.5,
      inflation: 2.5,
      unemployment: null,
      debtToGdp: 85,
      creditRating: "A",
    });
    expect(
      buildEconomyView({ budget, politicsEconomy: { growth: 0.4, unemployment: 6 } })
    ).toMatchObject({ growth: 0.4, inflation: 2.5, unemployment: 6 });
    expect(buildEconomyView({ budget: null }).gdp).toBeNull();
  });
});

describe("trade with the United States", () => {
  const tariffs = [
    { countryId: "US", scopeType: "economy_wide", rate: 5 },
    { countryId: "US", scopeType: "origin_country", targetOriginCountryId: "FR", rate: 10 },
    { countryId: "US", scopeType: "origin_country", targetOriginCountryId: "IT", rate: 30 },
    { countryId: "US", scopeType: "sector", rate: 50 },
    { countryId: "FR", scopeType: "origin_country", targetOriginCountryId: "US", rate: 4 },
  ];

  it("adds economy-wide and origin tariffs only", () => {
    expect(headlineTariff(tariffs, "US", "FR")).toBe(15);
    expect(headlineTariff(tariffs, "FR", "US")).toBe(4);
    expect(headlineTariff(tariffs, "DE", "US")).toBe(0);
  });

  it("sums both directed flows across commodities", () => {
    const view = buildBilateralTrade({
      countryId: "FR",
      partnerId: "US",
      commodities: {
        steel: { flow: { FR: { US: 10, DE: 99 }, US: { FR: 4 } } },
        grain: { flow: { US: { FR: 6 } } },
        oil: undefined,
      },
      snapshotTurn: 7,
      tariffs,
    });
    expect(view).toEqual({
      partnerId: "US",
      exports: 10,
      imports: 10,
      partnerTariff: 15,
      ownTariff: 4,
      snapshotTurn: 7,
    });
  });
});
