import { describe, expect, it } from "vitest";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import { getDebtThreshold } from "@/lib/budget/debt";
import { computeMacroContribution } from "../kernel";
import { BACKGROUND_CONSTITUTIONS } from "./backgroundConstitution";
import {
  advancePriceLevel,
  backgroundAnnualGdp,
  backgroundBudgetFigures,
  closeBackgroundFiscalYear,
  initialBackgroundFiscal,
  macroAggregateOutput,
  realizedOutputFactor,
  type BackgroundFiscalState,
} from "./backgroundBudget";
import {
  advanceNationalPolitics,
  initNationalPolitics,
  runNationalElection,
  type NationalPoliticsState,
} from "./nationalPolitics";

const TPY = 48;

describe("background budget figures", () => {
  it("derives GDP from output and revenue from fiscal capacity", () => {
    const fiscal = initialBackgroundFiscal({
      output: 1_000,
      gdpLocal: 3_000_000_000_000,
      fiscalCapacity: 0.52,
      initialPrimaryBalance: -0.03,
    });
    expect(fiscal.programmeShare).toBeCloseTo(0.55, 10);
    expect(backgroundAnnualGdp(fiscal, 1_000)).toBe(3_000_000_000_000);
    expect(backgroundAnnualGdp(fiscal, 1_100)).toBeCloseTo(3_300_000_000_000, 0);
    expect(backgroundAnnualGdp({ ...fiscal, priceLevel: 1.02 }, 1_000)).toBeCloseTo(
      3_060_000_000_000,
      0
    );

    const figures = backgroundBudgetFigures({
      gdp: 3_000_000_000_000,
      fiscalCapacity: 0.52,
      fiscal,
      debtInterest: 60_000_000_000,
    });
    expect(figures.revenueTotal).toBeCloseTo(0.52 * 3e12, 0);
    expect(figures.programmes).toBeCloseTo(0.55 * 3e12, 0);
    expect(figures.spendingTotal).toBeCloseTo(0.55 * 3e12 + 6e10, 0);
  });

  it("sums sector output and compounds the price level by the year", () => {
    expect(
      macroAggregateOutput({
        manufacturing: { capacity: 100, productivity: 1.1 },
        retail: { capacity: 50, productivity: 1 },
      })
    ).toBeCloseTo(160, 10);
    expect(advancePriceLevel(1, 4, TPY, TPY)).toBeCloseTo(1.04, 10);
    expect(advancePriceLevel(1, 4, 0, TPY)).toBe(1);
  });
});

describe("closeBackgroundFiscalYear", () => {
  const base = initialBackgroundFiscal({
    output: 1,
    gdpLocal: 1_000,
    fiscalCapacity: 0.4,
    initialPrimaryBalance: -0.08,
  });

  function close(fiscal: BackgroundFiscalState, position: number | null, debtInterest = 0) {
    return closeBackgroundFiscalYear({
      fiscal,
      gdp: 1_000,
      fiscalCapacity: 0.4,
      debtInterest,
      debtToGdpRatio: 0.6,
      debtThreshold: { gdpPenalty: 0 },
      governmentEconomicPosition: position,
      fiscalYear: 2028,
      turn: 48,
      consolidate: true,
    });
  }

  it("enacts a package against a deep primary deficit and records its approval cost", () => {
    const closed = close(base, 0);
    expect(closed.package).not.toBeNull();
    expect(closed.fiscal.programmeScale).toBeLessThan(1);
    expect(closed.fiscal.taxScale).toBeGreaterThan(1);
    expect(closed.fiscal.lastPackage?.approvalCost).toBeGreaterThan(0);
    expect(closed.fiscal.lastPackage?.turn).toBe(48);
  });

  it("splits the package by the government's economics", () => {
    const left = close(base, -5);
    const right = close(base, 5);
    expect(left.package!.taxRise).toBeGreaterThan(right.package!.taxRise);
    expect(right.package!.spendingCut).toBeGreaterThan(left.package!.spendingCut);
  });

  it("moves programme spending toward the government's stance", () => {
    const balanced = { ...base, programmeShare: 0.4, baseProgrammeShare: 0.4 };
    expect(close(balanced, -5).fiscal.programmeShare).toBeGreaterThan(0.4);
    expect(close(balanced, 5).fiscal.programmeShare).toBeLessThan(0.4);
  });

  it("does nothing when the primary balance is inside the floor", () => {
    const sound = initialBackgroundFiscal({
      output: 1,
      gdpLocal: 1_000,
      fiscalCapacity: 0.4,
      initialPrimaryBalance: 0.01,
    });
    expect(close(sound, 0).package).toBeNull();
  });

  it("restructures after two years of interest above half of revenue, then resets the count", () => {
    const first = close(base, 0, 300);
    expect(first.restructure).toBe(false);
    expect(first.fiscal.interestSpiralYears).toBe(1);
    const second = close(first.fiscal, 0, 300);
    expect(second.restructure).toBe(true);
    expect(second.fiscal.interestSpiralYears).toBe(0);
  });
});

describe("a background budget cannot spiral without a political response", () => {
  const c = BACKGROUND_CONSTITUTIONS.IT;
  const fiscalCapacity = 0.42;
  const expectations = { trendGrowth: 0.007, naturalUnemployment: 7.5 };
  const namePool = { firstNames: ["Marco"], surnames: ["Rossi"] };

  /** Six fiscal years of a flat economy, with or without the stabilizer. */
  function run(consolidate: boolean) {
    let fiscal = initialBackgroundFiscal({
      output: 1_000,
      gdpLocal: 2_000_000,
      fiscalCapacity,
      initialPrimaryBalance: -0.1,
    });
    let politics = initNationalPolitics({
      constitution: c,
      parties: [
        {
          partyId: "a",
          name: "Alpha Party",
          abbreviation: "AP",
          color: "#111",
          economic: 2,
          social: 1,
          strength: 45,
        },
        {
          partyId: "b",
          name: "Beta Party",
          abbreviation: "BP",
          color: "#222",
          economic: -2,
          social: -1,
          strength: 40,
        },
        {
          partyId: "c",
          name: "Gamma Party",
          abbreviation: "GP",
          color: "#333",
          economic: 0,
          social: 3,
          strength: 15,
        },
      ],
      turn: 1,
      year: 2027,
      turnsPerYear: TPY,
      output: 1_000,
      inflation: 2,
      expectations,
      namePool,
      rng: makeSeededRng("spiral"),
    }) as NationalPoliticsState;
    // Hold the regular election back so the comparison sees the whole window.
    politics = { ...politics, nextElectionTurn: 10_000 };

    let debt = 2_400_000;
    const balances: number[] = [];
    const approvals: number[] = [];
    let packages = 0;
    let afterFirstPackage: NationalPoliticsState | null = null;
    for (let year = 0; year < 6; year++) {
      const gdp = backgroundAnnualGdp(fiscal, 1_000)!;
      const interest = debt * 0.035;
      const closed = closeBackgroundFiscalYear({
        fiscal,
        gdp,
        fiscalCapacity,
        debtInterest: interest,
        debtToGdpRatio: debt / gdp,
        debtThreshold: getDebtThreshold(debt / gdp),
        governmentEconomicPosition: 0,
        fiscalYear: 2028 + year,
        turn: 1 + (year + 1) * TPY,
        consolidate,
      });
      fiscal = closed.fiscal;
      if (closed.package) packages++;
      const figures = backgroundBudgetFigures({
        gdp,
        fiscalCapacity,
        fiscal,
        debtInterest: interest,
      });
      balances.push((figures.revenueTotal - figures.programmes) / gdp);
      debt += figures.spendingTotal - figures.revenueTotal;
      for (let t = 1; t <= TPY / 6; t++) {
        const turn = 1 + (year + 1) * TPY + t * 6;
        politics = advanceNationalPolitics(politics, {
          countryId: "IT",
          constitution: c,
          turn,
          year: 2028 + year,
          turnsPerYear: TPY,
          output: 1_000,
          inflation: 2,
          expectations,
          austerity: fiscal.lastPackage
            ? { approvalCost: fiscal.lastPackage.approvalCost, turn: fiscal.lastPackage.turn }
            : null,
          namePool,
          rng: makeSeededRng(`spiral:${turn}`),
        }).state;
        approvals.push(politics.approval);
        if (year === 0 && t === 4) afterFirstPackage = politics;
      }
    }
    return {
      balances,
      approvals,
      packages,
      afterFirstPackage: afterFirstPackage!,
      debtToGdp: debt / backgroundAnnualGdp(fiscal, 1_000)!,
    };
  }

  it("closes the deficit, and the government pays for it in approval and at the polls", () => {
    const stabilized = run(true);
    const drifting = run(false);

    // Without a response the deficit never closes and debt climbs; with it the
    // primary balance improves every year toward the -3% floor.
    expect(drifting.packages).toBe(0);
    expect(drifting.balances.every((b) => b < -0.09)).toBe(true);
    expect(stabilized.packages).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < stabilized.balances.length; i++) {
      expect(stabilized.balances[i]).toBeGreaterThanOrEqual(stabilized.balances[i - 1] - 1e-9);
    }
    expect(stabilized.balances[stabilized.balances.length - 1]).toBeGreaterThan(-0.035);
    expect(stabilized.debtToGdp).toBeLessThan(drifting.debtToGdp);

    // The political model pays: approval runs lower through the consolidation years...
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(stabilized.approvals)).toBeLessThan(mean(drifting.approvals) - 2);

    // ...and an election half a year into the first package goes worse for it.
    const defeats = (state: NationalPoliticsState) => {
      let lost = 0;
      for (let i = 0; i < 30; i++) {
        const result = runNationalElection(state, {
          countryId: "IT",
          constitution: c,
          turn: 400,
          year: 2034,
          turnsPerYear: TPY,
          expectations,
          namePool,
          rng: makeSeededRng(`vote:${i}`),
          snap: false,
        });
        if (result.state.lastElection?.governmentChanged) lost++;
      }
      return lost;
    };
    expect(defeats(stabilized.afterFirstPackage)).toBeGreaterThan(
      defeats(drifting.afterFirstPackage)
    );
  });
});

describe("realized output", () => {
  const sectors = {
    agriculture: { capacity: 600, productivity: 1 },
    manufacturing: { capacity: 400, productivity: 1.5 },
  };

  it("scales aggregate output by stability and shock", () => {
    const factor = realizedOutputFactor(0.8, 0.5);
    expect(factor).toBeCloseTo(0.4, 10);
    expect(macroAggregateOutput(sectors, factor)).toBeCloseTo(
      macroAggregateOutput(sectors) * 0.4,
      6
    );
  });

  it("treats a missing or invalid shock as none", () => {
    expect(realizedOutputFactor(1, Number.NaN)).toBe(1);
    expect(realizedOutputFactor(1, 0)).toBe(1);
    expect(realizedOutputFactor(2, 1)).toBe(1);
  });

  it("matches the output market production applies", () => {
    const state = {
      sectors: Object.fromEntries(
        Object.entries(sectors).map(([k, v]) => [k, { ...v, domesticDemand: 0 }])
      ),
      resources: {},
      stability: 0.7,
      tradeExposure: 0.5,
      shockModifier: 0.5,
      population: 0,
      economicSystem: "market",
    };
    const produced = Object.values(computeMacroContribution(state as never, 1).bySector).reduce(
      (sum, s) => sum + (s?.output ?? 0),
      0
    );
    expect(macroAggregateOutput(sectors, realizedOutputFactor(0.7, 0.5))).toBeCloseTo(produced, 1);
  });
});
