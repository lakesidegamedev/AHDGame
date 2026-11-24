import { describe, expect, it } from "vitest";
import {
  BRIEF_COOLDOWN_TURNS,
  CURRENCY_MOVE_PERCENT,
  briefActions,
  currencyMovePercent,
  outlookStagger,
  planBriefs,
  type BriefMemory,
  type BriefObservation,
} from "./countryBriefs";

const obs = (over: Partial<BriefObservation> = {}): BriefObservation => ({
  countryId: "FR",
  countryName: "France",
  turn: 300,
  currencyCode: "EUR",
  debtToGdp: 90,
  creditRating: "AA",
  growth: 1.2,
  inflation: 2,
  interestSpiralYears: 0,
  lastPackage: null,
  election: null,
  headName: "Claire Martin",
  crisisFiredTurn: null,
  fx: { rate: 1, history: [{ turn: 250, value: 1 }] },
  bond: { id: "64b0000000000000000000bb", couponRate: 3.5, marketPrice: 0.98 },
  fund: { slug: "fr-national", countryId: "FR", name: "France National Index" },
  ...over,
});

const memory = (over: Partial<BriefMemory> = {}): BriefMemory => ({
  lastByKind: { outlook: 290 },
  rating: "AA",
  spiralYears: 0,
  electionTurn: null,
  packageTurn: null,
  crisisTurn: null,
  ...over,
});

describe("planBriefs", () => {
  it("posts nothing on the first look and seeds a staggered outlook", () => {
    const plan = planBriefs(
      obs({ election: { turn: 10, year: 2027, snap: false, governmentChanged: true } }),
      null
    );
    expect(plan.briefs).toEqual([]);
    expect(plan.memory.electionTurn).toBe(10);
    const outlook = plan.memory.lastByKind.outlook as number;
    expect(300 - outlook).toBe(outlookStagger("FR", BRIEF_COOLDOWN_TURNS.outlook));
    expect(300 - outlook).toBeLessThan(BRIEF_COOLDOWN_TURNS.outlook);
  });

  it("reports a downgrade as debt stress with every action attached", () => {
    const plan = planBriefs(obs({ creditRating: "A" }), memory());
    expect(plan.briefs).toHaveLength(1);
    const [brief] = plan.briefs;
    expect(brief.kind).toBe("debt_stress");
    expect(brief.body).toContain("from AA to A");
    expect(brief.body).toContain("3.50%");
    expect(brief.actions.map((a) => a.kind)).toEqual(["bonds", "index_fund", "currency", "trade"]);
    expect(plan.memory.rating).toBe("A");
    expect(plan.memory.lastByKind.debt_stress).toBe(300);
  });

  it("holds a second debt brief inside the cooldown", () => {
    const plan = planBriefs(
      obs({ creditRating: "A" }),
      memory({ lastByKind: { debt_stress: 290, outlook: 290 } })
    );
    expect(plan.briefs).toEqual([]);
  });

  it("reports a worsening interest spiral, naming the restructuring trigger", () => {
    const plan = planBriefs(obs({ interestSpiralYears: 1 }), memory());
    expect(plan.briefs[0].body).toContain("two triggers a restructuring");
  });

  it("reports a restructuring instead of the debt stress behind it", () => {
    const plan = planBriefs(obs({ crisisFiredTurn: 298, creditRating: "BB" }), memory());
    expect(plan.briefs.map((b) => b.kind)).toEqual(["restructuring"]);
    expect(plan.memory.crisisTurn).toBe(298);
    // And once seen, never twice.
    expect(
      planBriefs(obs({ crisisFiredTurn: 298, creditRating: "BB" }), plan.memory).briefs
    ).toEqual([]);
  });

  it("reports each new election and austerity package once", () => {
    const o = obs({
      election: { turn: 295, year: 2029, snap: true, governmentChanged: true },
      lastPackage: {
        turn: 296,
        fiscalYear: 2029,
        sizeGdpShare: 0.014,
        taxRise: 12_809_692_289.646,
        spendingCut: 14_998_877_577.022,
      },
    });
    const first = planBriefs(o, memory());
    expect(first.briefs.map((b) => b.kind).sort()).toEqual(["austerity", "election"]);
    const austerity = first.briefs.find((b) => b.kind === "austerity")?.body;
    expect(austerity).toContain("1.4% of GDP");
    expect(austerity).toContain("12.8B EUR in tax increases");
    expect(austerity).toContain("15.0B EUR in spending cuts");
    expect(planBriefs(o, first.memory).briefs).toEqual([]);
  });

  it("reports a large currency move with its direction, once per cooldown", () => {
    const slide = obs({ fx: { rate: 1.2, history: [{ turn: 270, value: 1 }] } });
    const plan = planBriefs(slide, memory());
    expect(plan.briefs[0].kind).toBe("currency_move");
    expect(plan.briefs[0].headline).toContain("slides");
    expect(planBriefs(slide, plan.memory).briefs).toEqual([]);
  });

  it("falls back to a periodic outlook when nothing else happened", () => {
    const quiet = planBriefs(obs(), memory({ lastByKind: { outlook: 100 } }));
    expect(quiet.briefs.map((b) => b.kind)).toEqual(["outlook"]);
    expect(quiet.briefs[0].body).toContain("steady 1.2%");
    expect(planBriefs(obs(), memory({ lastByKind: { outlook: 250 } })).briefs).toEqual([]);
  });

  it("writes no dashes in any brief", () => {
    const o = obs({
      creditRating: "A",
      interestSpiralYears: 1,
      election: { turn: 295, year: 2029, snap: false, governmentChanged: false },
      lastPackage: {
        turn: 296,
        fiscalYear: 2029,
        sizeGdpShare: 0.014,
        taxRise: 0.006,
        spendingCut: 0.008,
      },
      fx: { rate: 0.8, history: [{ turn: 270, value: 1 }] },
    });
    for (const brief of planBriefs(o, memory()).briefs) {
      expect(`${brief.headline} ${brief.body}`).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe("currencyMovePercent", () => {
  it("measures strength, so a falling rate is a rise", () => {
    const fx = { rate: 0.9, history: [{ turn: 260, value: 1 }] };
    expect(currencyMovePercent(fx, 300)).toBeCloseTo(11.1, 1);
    expect(Math.abs(currencyMovePercent(fx, 300) ?? 0)).toBeGreaterThan(CURRENCY_MOVE_PERCENT);
  });

  it("needs a point at least a window old", () => {
    expect(currencyMovePercent({ rate: 1, history: [{ turn: 295, value: 1.5 }] }, 300)).toBeNull();
    expect(currencyMovePercent(null, 300)).toBeNull();
  });
});

describe("briefActions", () => {
  it("falls back to the bond market and drops absent actions", () => {
    const actions = briefActions(obs({ bond: null, fund: null, currencyCode: null }));
    expect(actions.map((a) => a.href)).toEqual(["/market?tab=bonds", "/world/trade"]);
  });
});

describe("rating moves and wording", () => {
  it("reports an upgrade as an upgrade, never as debt strain", () => {
    const plan = planBriefs(obs({ creditRating: "AAA", debtToGdp: 40 }), memory({ rating: "AA" }));
    expect(plan.briefs).toHaveLength(1);
    const [brief] = plan.briefs;
    expect(brief.kind).toBe("rating_upgrade");
    expect(brief.headline).toBe("France upgraded to AAA");
    expect(brief.headline).not.toMatch(/strain/);
    expect(brief.body).toContain("rose from AA to AAA");
  });

  it("dates the bond price to when the brief was written", () => {
    const plan = planBriefs(obs({ creditRating: "A" }), memory());
    expect(plan.briefs[0].body).toContain("traded at 98.0 when this brief was written");
  });

  it("gives elections in different economies different text", () => {
    const election = { turn: 299, year: 2027, snap: true, governmentChanged: true };
    const calm = planBriefs(obs({ election, inflation: 2, growth: 1 }), memory()).briefs[0];
    const hot = planBriefs(obs({ election, inflation: 23.2 }), memory()).briefs[0];
    expect(hot.body).toContain("inflation at 23.2%");
    expect(hot.body).not.toBe(calm.body);
  });
});
