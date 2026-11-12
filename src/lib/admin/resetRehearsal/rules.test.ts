import { describe, expect, it } from "vitest";
import {
  assertRehearsalTarget,
  checkBudgets,
  checkCentralBanks,
  checkIncomePlausibility,
  checkMoney,
  checkParties,
  checkReferenceFigures,
  checkRegionalGrowth,
  checkSeats,
  checkStartingCompanies,
  checkTurnLog,
  runWorldChecks,
  type RehearsalWorld,
} from "./rules";

function world(over: Partial<RehearsalWorld> = {}): RehearsalWorld {
  return {
    rosterCountries: ["US", "IT"],
    playerEnabledCountries: ["US"],
    nppRunCountries: [],
    noStartingParties: false,
    euroMembers: ["DE", "IT"],
    budgets: [
      { countryId: "US", gdp: 1000, inflationRate: 2 },
      { countryId: "IT", gdp: 500, inflationRate: 2 },
    ],
    centralBanks: [
      { id: "US", countryId: "US", primeRate: 3 },
      { id: "ECB", countryId: "DE", primeRate: 2 },
    ],
    regions: [
      { id: "US_A", countryId: "US", population: 10, medianIncome: 60, gdpGrowth: 2 },
      { id: "IT_A", countryId: "IT", population: 10, medianIncome: 30, gdpGrowth: 1 },
    ],
    partyCountByCountry: { US: 2, IT: 3 },
    spawnPlan: [{ countryId: "US", perSectorCount: 1 }],
    operatingIndustryCount: 2,
    corporations: [
      { id: "a", ceoType: "npp", countryId: "US", isNpcBank: false },
      { id: "b", ceoType: "npp", countryId: "US", isNpcBank: false },
      { id: "c", ceoType: "npp", countryId: "US", isNpcBank: true },
      { id: "d", ceoType: "npp", countryId: "US", isNpcBank: true },
    ],
    seatTotalByCountry: { US: 5 },
    localPerUsd: { US: 1, IT: 0.9 },
    ...over,
  };
}

describe("rehearsal rules", () => {
  it("passes a healthy world", () => {
    expect(runWorldChecks(world()).flatMap((r) => r.failures)).toEqual([]);
  });

  it("flags missing and empty budgets", () => {
    const w = world({ budgets: [{ countryId: "US", gdp: 0 }] });
    expect(checkBudgets(w).map((f) => f.scope)).toEqual(["US", "IT"]);
  });

  it("covers euro members with the ECB row and flags a differing own rate", () => {
    expect(checkCentralBanks(world())).toEqual([]);
    const w = world({
      centralBanks: [
        { id: "US", countryId: "US", primeRate: 3 },
        { id: "ECB", countryId: "DE", primeRate: 2 },
        { id: "IT", countryId: "IT", primeRate: 12 },
      ],
    });
    const failures = checkCentralBanks(w);
    expect(failures.some((f) => f.scope === "IT" && f.message.includes("differs from ECB"))).toBe(
      true
    );
  });

  it("flags a missing bank for a non-euro country and allows high rates under high inflation", () => {
    const missing = world({ centralBanks: [{ id: "ECB", countryId: "DE", primeRate: 2 }] });
    expect(checkCentralBanks(missing).map((f) => f.scope)).toEqual(["US"]);
    const tooHigh = world({
      centralBanks: [
        { id: "US", countryId: "US", primeRate: 25 },
        { id: "ECB", countryId: "DE", primeRate: 2 },
      ],
    });
    expect(checkCentralBanks(tooHigh)).toHaveLength(1);
    const inflating = world({
      budgets: [
        { countryId: "US", gdp: 1000, inflationRate: 40 },
        { countryId: "IT", gdp: 500 },
      ],
      centralBanks: [
        { id: "US", countryId: "US", primeRate: 25 },
        { id: "ECB", countryId: "DE", primeRate: 2 },
      ],
    });
    expect(checkCentralBanks(inflating)).toEqual([]);
  });

  it("catches incomes left in a legacy currency", () => {
    const w = world({
      regions: [
        { id: "IT_A", countryId: "IT", population: 10, medianIncome: 3 },
        { id: "US_A", countryId: "US", population: 10, medianIncome: 60 },
      ],
    });
    const failures = checkIncomePlausibility(w);
    expect(failures).toHaveLength(1);
    expect(failures[0].scope).toBe("IT");
  });

  it("bounds regional growth", () => {
    const w = world({
      regions: [{ id: "x", countryId: "US", population: 1, gdpGrowth: 11 }],
    });
    expect(checkRegionalGrowth(w)).toHaveLength(1);
  });

  it("requires zero parties in player countries only when no starting parties", () => {
    const w = world({ noStartingParties: true, partyCountByCountry: { US: 2, IT: 1 } });
    expect(checkParties(w).map((f) => f.scope)).toEqual(["US"]);
    expect(checkParties(world({ partyCountByCountry: { US: 1 } })).map((f) => f.scope)).toEqual([
      "IT",
    ]);
  });

  it("requires enough NPP corporations and exactly two NPC banks", () => {
    const w = world({
      corporations: [{ id: "a", ceoType: "npp", countryId: "US", isNpcBank: false }],
    });
    expect(checkStartingCompanies(w)).toHaveLength(2);
  });

  it("requires seats for player and NPP-run countries", () => {
    const w = world({ nppRunCountries: ["IT"] });
    expect(checkSeats(w).map((f) => f.scope)).toEqual(["IT"]);
  });

  it("flags non-finite capital and share mismatches", () => {
    const w = world({
      corporations: [
        { id: "n", ceoType: "npp", isNpcBank: false, liquidCapital: Number.NaN },
        {
          id: "s",
          ceoType: "npp",
          isNpcBank: false,
          totalShares: 100,
          shareholderShares: [50],
          publicFloat: 40,
        },
        {
          id: "ok",
          ceoType: "npp",
          isNpcBank: false,
          totalShares: 100,
          shareholderShares: [60],
          publicFloat: 40,
        },
        { id: "skip", ceoType: "npp", isNpcBank: false, totalShares: 100 },
      ],
    });
    expect(checkMoney(w).map((f) => f.scope)).toEqual(["n", "s"]);
  });

  it("fails a turn log that is missing, unsuccessful or has failed phases", () => {
    expect(checkTurnLog(null)).toHaveLength(1);
    expect(checkTurnLog({ success: true })).toEqual([]);
    expect(checkTurnLog({ success: false, failedPhases: ["economy"] })).toHaveLength(2);
  });
});

describe("assertRehearsalTarget", () => {
  const ok = "mongodb://127.0.0.1:27098/rehearsal-gate?directConnection=true";
  it("accepts a local rehearsal database", () => {
    expect(() => assertRehearsalTarget(ok, "rehearsal-gate")).not.toThrow();
    expect(() => assertRehearsalTarget("mongodb://localhost/x", "rehearsal-x")).not.toThrow();
  });
  it("refuses remote hosts, srv URIs, credentials hiding a host and other database names", () => {
    expect(() =>
      assertRehearsalTarget("mongodb://db.example.com/rehearsal-a", "rehearsal-a")
    ).toThrow();
    expect(() =>
      assertRehearsalTarget("mongodb+srv://127.0.0.1/rehearsal-a", "rehearsal-a")
    ).toThrow();
    expect(() =>
      assertRehearsalTarget("mongodb://127.0.0.1@db.example.com/rehearsal-a", "rehearsal-a")
    ).toThrow();
    expect(() =>
      assertRehearsalTarget("mongodb://127.0.0.1,db.example.com/rehearsal-a", "rehearsal-a")
    ).toThrow();
    expect(() => assertRehearsalTarget(ok, "ahd")).toThrow();
  });
});

describe("reference figures", () => {
  const range = {
    gdpPerHeadUsd: [50, 150],
    primeRate: [1, 6],
    inflation: [0, 5],
    debtToGdp: [0.2, 1.5],
  } as const;
  const ref = (over: Partial<RehearsalWorld> = {}) =>
    world({
      reference: { US: range, IT: { ...range, gdpPerHeadUsd: [40, 80], primeRate: [0.5, 4] } },
      budgets: [
        { countryId: "US", gdp: 1000, inflationRate: 2, debtPrincipal: 800 },
        { countryId: "IT", gdp: 500, inflationRate: 2, debtPrincipal: 400 },
      ],
      ...over,
    });

  it("passes figures inside their ranges and skips a preset with no table", () => {
    expect(checkReferenceFigures(ref())).toEqual([]);
    expect(checkReferenceFigures(world())).toEqual([]);
  });

  it("converts gdp per head through the exchange rate", () => {
    const failures = checkReferenceFigures(ref({ localPerUsd: { US: 1, IT: 5 } }));
    expect(failures.map((f) => f.scope)).toEqual(["IT"]);
    expect(failures[0].message).toContain("gdp per head");
  });

  it("flags inflation, debt and prime rate outside range", () => {
    const failures = checkReferenceFigures(
      ref({
        budgets: [
          { countryId: "US", gdp: 1000, inflationRate: 9, debtPrincipal: 5000 },
          { countryId: "IT", gdp: 500, inflationRate: 2, debtPrincipal: 400 },
        ],
        centralBanks: [
          { id: "US", countryId: "US", primeRate: 12 },
          { id: "ECB", countryId: "DE", primeRate: 2 },
        ],
      })
    );
    expect(failures.map((f) => f.message.split(" ")[0] + f.scope).sort()).toEqual([
      "debtUS",
      "inflationUS",
      "primeUS",
    ]);
  });

  it("checks a euro member without its own row against the ECB", () => {
    const failures = checkReferenceFigures(
      ref({
        centralBanks: [
          { id: "US", countryId: "US", primeRate: 3 },
          { id: "ECB", countryId: "DE", primeRate: 9 },
        ],
      })
    );
    expect(failures.map((f) => f.scope)).toEqual(["IT"]);
  });

  it("fails a rostered country with no reference row", () => {
    const failures = checkReferenceFigures(ref({ reference: { US: range } }));
    expect(failures).toEqual([
      expect.objectContaining({ scope: "IT", message: "no reference row for a rostered country" }),
    ]);
  });
});
