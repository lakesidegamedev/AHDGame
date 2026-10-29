import { describe, it, expect } from "vitest";
import { GENERAL_CHARTS } from "./general";
import { expectValidChart } from "./chartTestUtils";
import { DECAY_RATE } from "@/lib/turn/metricDecay";
import { RELOCATION_COOLDOWN_TURNS } from "@/lib/character/relocationCooldown";
import { getCampaignActionCost } from "@/lib/actions/rules";
import { energyActionLimits } from "@/lib/stats/statDrift";
import { STAT_MIN } from "@/lib/stats/statsConstants";
import { calculateNationalInfluenceGain } from "@shared/constants/formulas";
import { JP_SHUGIIN_SEATS, JP_SANGIIN_SEATS } from "@/lib/countries/jp/data/jpSeats";
import { BUNDESTAG_VOTE_THRESHOLD } from "@/lib/turn/election/sainteLagueAllocation";
import { INITIAL_CONFIDENCE, MAX_CONFIDENCE } from "@/lib/onePartyState/rulingPartyConfidence";
import { DD_VOLKSKAMMER_1953 } from "@/lib/constants/historicalSeats";
import { statRollAdjustment } from "@/lib/events/substrate/rollAdjustment";

const build = (id: string) => {
  const spec = GENERAL_CHARTS[id]();
  expectValidChart(id, spec);
  return spec;
};

describe("general wiki charts", () => {
  it("all build and are valid", () => {
    for (const id of Object.keys(GENERAL_CHARTS)) build(id);
  });

  it("metric decay follows the decay rate", () => {
    const spec = build("metric-decay-recovery");
    const [x, y] = spec.series[0].points[10];
    expect(y).toBeCloseTo(100 * Math.pow(1 - DECAY_RATE, x), 3);
  });

  it("campaign cost steps match the action cost function", () => {
    const spec = build("campaign-advertise-action-cost");
    for (const [x, y] of spec.series[0].points) expect(y).toBe(getCampaignActionCost(x));
  });

  it("action stockpile uses the energy limits", () => {
    const spec = build("action-stockpile-hoarding");
    const { cap, threshold } = energyActionLimits(STAT_MIN);
    expect(spec.markers?.find((m) => m.label.includes("cap"))?.y).toBe(cap);
    expect(spec.markers?.find((m) => m.label.includes("penalty"))?.y).toBe(threshold);
  });

  it("national influence gain matches the formula", () => {
    const spec = build("national-influence-gain-from-pi");
    for (const [x, y] of spec.series[0].points) {
      expect(y).toBeCloseTo(calculateNationalInfluenceGain(x), 3);
    }
  });

  it("relocation cooldown marker and event roll adjustment use game rules", () => {
    expect(build("relocation-cooldown").markers?.[0].x).toBe(RELOCATION_COOLDOWN_TURNS);
    const roll = build("event-roll-stat-adjustment");
    for (const [x, y] of roll.series[0].points) expect(y).toBe(statRollAdjustment(x));
  });

  it("seat charts read the seat tables", () => {
    const jp = build("jp-seats-by-region");
    expect(jp.series[0].points.map((p) => p[1])).toEqual(Object.values(JP_SHUGIIN_SEATS));
    expect(jp.series[1].points.map((p) => p[1])).toEqual(Object.values(JP_SANGIIN_SEATS));
    const dd = build("dd-volkskammer-seats-by-party");
    const sed1953 = DD_VOLKSKAMMER_1953.filter((s) => s.party === "dd_sed").reduce(
      (a, s) => a + s.seatsHeld,
      0
    );
    expect(dd.series[0].points[0][1]).toBe(sed1953);
  });

  it("German threshold marker and confidence markers use constants", () => {
    expect(build("de-vote-threshold-seats").markers?.[0].x).toBeCloseTo(
      BUNDESTAG_VOTE_THRESHOLD * 100
    );
    const cn = build("cn-leader-confidence-bands");
    expect(cn.markers?.some((m) => m.x === INITIAL_CONFIDENCE)).toBe(true);
    expect(cn.markers?.some((m) => m.x === MAX_CONFIDENCE)).toBe(true);
  });
});
