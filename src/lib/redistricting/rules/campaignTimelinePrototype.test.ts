import { describe, expect, it } from "vitest";
import {
  runCampaignTimeline,
  quoteTimelineAction,
  type CampaignTimelineInput,
  type TimelineAction,
} from "./campaignTimelinePrototype";
import { effectivePsCost } from "@/lib/politicalStrength/strengthConstants";

const spots = [
  { id: "a", countyId: "split", districtId: "one", ballots: 10000, lean: 0 },
  { id: "b", countyId: "split", districtId: "two", ballots: 10000, lean: 0 },
];
const input: CampaignTimelineInput = {
  spots,
  ballots: [
    [5000, 5000],
    [5000, 5000],
  ],
  turnoutWeights: Array(24).fill(1),
  actions: [],
  openingPs: [30, 30],
  psIncome: [5, 5],
  psCap: 30,
  baseCost: 2,
  pressureIncrement: 1,
  pressureDecay: 3,
  pressureCap: 8,
  maxUnitCost: 8,
  effectPoints: 0.4,
  effectCap: 3,
  effectDecay: 0.1,
  decayMode: "linear",
  countyFactor: 0.6,
  pricing: "coverage",
  actionsPerPartyPerTurn: 8,
};
const action = (id: string, turn = 0, actor: 0 | 1 = 0): TimelineAction => ({
  id,
  turn,
  actor,
  kind: "boost",
  target: { districtId: "one" },
});

describe("multi-turn geographic campaign experiment", () => {
  it("prices frozen resident reach independently of ballot turnout and is invariant under population scaling", () => {
    const local = {
      ...input,
      pricing: "fractional-coverage" as const,
      actions: [{ ...action("county"), target: { countyId: "split" } }],
    };
    const a = runCampaignTimeline({ ...local, coveragePopulation: [100, 300] });
    const b = runCampaignTimeline({ ...local, coveragePopulation: [10000, 30000] });
    expect(a.receipts[0].cost).toBe(b.receipts[0].cost);
    expect(a.cumulative).toEqual(b.cumulative);
    expect(() => runCampaignTimeline({ ...local, coveragePopulation: [1] })).toThrow("coverage");
    expect(quoteTimelineAction(2, 0, 8, 8, true)).toBe(16);
    expect(quoteTimelineAction(2, 7, 8, 0.25, true)).toBe(2);
    expect(() => quoteTimelineAction(2, -1, 8, 1, true)).toThrow();
  });
  it("carries sub-vote effects forward instead of erasing small-county campaigning", () => {
    const tiny: CampaignTimelineInput = {
      ...input,
      spots: [{ ...spots[0], ballots: 722 }],
      ballots: [[361, 361]],
      actions: Array.from({ length: 24 }, (_, t) => action(String(t), t)),
      decayMode: "fractional",
      effectDecay: 0.25,
    };
    const independent = runCampaignTimeline({ ...tiny, rounding: "per-batch" });
    const carried = runCampaignTimeline({ ...tiny, rounding: "carry" });
    expect(independent.gainedVotes).toBe(0);
    expect(carried.gainedVotes).toBe(10);
    expect(carried.roundingRemainders.every((v) => Math.abs(v) <= 0.50000001)).toBe(true);
    expect(carried.conserved).toBe(true);
  });
  it("reconstructs baseline ballots without actions, across uneven and zero-turn turnout", () => {
    for (const turnoutWeights of [Array(24).fill(1), [0, 1, 9, 3, 0], [24]]) {
      const result = runCampaignTimeline({ ...input, turnoutWeights });
      expect(result.cumulative).toEqual(input.ballots);
      expect(result.gainedVotes).toBe(0);
    }
  });
  it("casts earlier ballots unchanged when a late action arrives", () => {
    const baseline = runCampaignTimeline(input);
    const result = runCampaignTimeline({ ...input, actions: [action("late", 23)] });
    expect(result.history.slice(0, 23).map((h) => h.votes)).toEqual(
      baseline.history.slice(0, 23).map((h) => h.votes)
    );
    expect(result.history[23].votes).not.toEqual(baseline.history[23].votes);
    expect(result.conserved).toBe(true);
  });
  it("applies linear or fractional decay after the first affected batch", () => {
    const linear = runCampaignTimeline({ ...input, actions: [action("pulse")] });
    [0.4, 0.3, 0.2, 0.1, 0].forEach((v, i) => expect(linear.history[i].maxEffect).toBeCloseTo(v));
    const fractional = runCampaignTimeline({
      ...input,
      actions: [action("pulse")],
      decayMode: "fractional",
      effectDecay: 0.25,
    });
    [0.4, 0.3, 0.225, 0.16875].forEach((v, i) =>
      expect(fractional.history[i].maxEffect).toBeCloseTo(v)
    );
  });
  it("exposes the unintended extra county penalty under absolute-point decay", () => {
    const countyAction = { ...action("county"), target: { countyId: "split" } };
    const area = (r: ReturnType<typeof runCampaignTimeline>) =>
      r.history.reduce((s, h) => s + h.maxEffect, 0);
    const single = runCampaignTimeline({ ...input, actions: [action("district")] });
    const county = runCampaignTimeline({ ...input, actions: [countyAction] });
    expect(area(county) / area(single)).toBeCloseTo(0.42);
    const fractional = { ...input, decayMode: "fractional" as const, effectDecay: 0.25 };
    expect(
      area(runCampaignTimeline({ ...fractional, actions: [countyAction] })) /
        area(runCampaignTimeline({ ...fractional, actions: [action("district")] }))
    ).toBeCloseTo(0.6);
  });
  it("matches the existing pressure cost and resets pressure by three each turn", () => {
    const actions = [0, 1].flatMap((turn) =>
      Array.from({ length: 3 }, (_, n) => action(`${turn}:${n}`, turn))
    );
    const result = runCampaignTimeline({ ...input, actions });
    expect(result.receipts.map((r) => r.cost)).toEqual([2, 3, 4, 2, 3, 4]);
    for (let i = 0; i < 3; i++) expect(result.receipts[i].cost).toBe(effectivePsCost(2, i));
    expect(result.spent[0]).toBe(18);
    expect(result.history[0].pressure[0]).toBe(3);
  });
  it("charges shared county coverage units and discounts split-county effects", () => {
    const result = runCampaignTimeline({
      ...input,
      actions: [{ ...action("county"), target: { countyId: "split" } }],
    });
    expect(result.receipts[0].cost).toBe(4);
    expect(result.history[0].pressure[0]).toBe(1);
    expect(result.history[0].maxEffect).toBeCloseTo(0.24);
    expect(
      runCampaignTimeline({
        ...input,
        pricing: "flat",
        actions: [{ ...action("county"), target: { countyId: "split" } }],
      }).spent[0]
    ).toBe(2);
  });
  it("allows affordable small-county targeting with half-PS quotes instead of a full-district price", () => {
    const localSpots = [
      { ...spots[0], countyId: "tiny", ballots: 1000 },
      { ...spots[1], countyId: "big", districtId: "one", ballots: 19000 },
    ];
    const local = {
      ...input,
      spots: localSpots,
      ballots: [
        [500, 500],
        [9500, 9500],
      ] as [number, number][],
      openingPs: [0.5, 0] as const,
      psIncome: [0, 0] as const,
      actions: [{ ...action("tiny"), target: { countyId: "tiny" } }],
    };
    expect(runCampaignTimeline(local).paid[0]).toBe(0);
    const fractional = runCampaignTimeline({ ...local, pricing: "fractional-coverage" });
    expect(fractional.spent[0]).toBe(0.5);
    expect(fractional.paid[0]).toBe(1);
    expect(fractional.creditedPs[0]).toBe(0);
    expect(fractional.ps[0]).toBe(0);
  });
  it("rejects unaffordable actions and at-cap no-ops without debiting PS", () => {
    const poor = runCampaignTimeline({
      ...input,
      openingPs: [0, 0],
      psIncome: [0, 0],
      actions: [action("poor")],
    });
    expect(poor.spent[0]).toBe(0);
    expect(poor.rejected.insufficient_ps).toBe(1);
    const capped = runCampaignTimeline({
      ...input,
      effectCap: 0.4,
      actions: [action("a"), action("b")],
    });
    expect(capped.spent[0]).toBe(2);
    expect(capped.rejected.at_cap).toBe(1);
  });
  it("enforces the party-wide turn limit and preserves spending and ballot accounting", () => {
    const result = runCampaignTimeline({
      ...input,
      actionsPerPartyPerTurn: 1,
      actions: [action("first"), action("second"), action("opponent", 0, 1)],
    });
    expect(result.paid).toEqual([1, 1]);
    expect(result.rejected.turn_limit).toBe(1);
    expect(result.spent).toEqual([2, 2]);
    expect(result.gainedVotes).toBe(0);
    expect(result.history.every((h) => h.ps.every((v) => v >= 0 && v <= 30))).toBe(true);
    expect(result.cumulative).toEqual(input.ballots);
  });
  it("rejects duplicate/out-of-window receipts and is deterministic without mutating input", () => {
    expect(() =>
      runCampaignTimeline({ ...input, actions: [action("same"), action("same")] })
    ).toThrow("receipt");
    expect(() => runCampaignTimeline({ ...input, actions: [action("outside", 24)] })).toThrow(
      "receipt"
    );
    expect(() =>
      runCampaignTimeline({
        ...input,
        actions: [{ ...action("bad"), target: { countyId: "absent" } }],
      })
    ).toThrow("target");
    const fixture = { ...input, actions: [action("a"), action("b", 3)] },
      before = structuredClone(fixture);
    expect(runCampaignTimeline(fixture)).toEqual(runCampaignTimeline(fixture));
    expect(fixture).toEqual(before);
  });
});
