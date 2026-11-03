import { describe, expect, it } from "vitest";
import { buildWikiChart } from "./index";
import { expectValidChart } from "./chartTestUtils";
import { ELECTIONS_CHARTS } from "./elections";
import {
  FINAL_POOL_SHARE,
  ELECTION_DAY_TURNS,
  turnVoteWeight,
} from "@/lib/electionEngine/voteCalculations";
import {
  MAX_STATE_ORG_BONUS_PRIMARY,
  STATE_ORG_MAX_LEVEL,
  stateOrgBonusFraction,
  stateOrgLevelCost,
} from "@/lib/electionEngine/constants";
import { approvalScalar } from "@/lib/utils/demographicAppeal";
import { advertiseFavorabilityGain } from "@/lib/actions/advertiseGain";
import { AD_BONUS_CAP, TURNOUT_CAP } from "@/lib/campaignTargeting/rules";
import { REQUEST_THRESHOLD } from "@/lib/constants/referendum";
import { PRE_FINAL_REPORTING_CAP } from "@/lib/elections/liveResults/computeResults";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import { resolveRedistrictCaps } from "@/lib/redistricting/caps";
import { BASE_UNCERTAINTY_BAND } from "@/lib/demographics/granularPollUncertainty";

function chart(id: string) {
  const spec = buildWikiChart(id);
  expect(spec, id).not.toBeNull();
  expectValidChart(id, spec!);
  return spec!;
}

describe("elections charts", () => {
  it("every elections chart is valid", () => {
    for (const id of Object.keys(ELECTIONS_CHARTS)) chart(id);
  });

  it("vote pool releases the engine's per-turn weight and sums to 100", () => {
    const spec = chart("general-election-vote-pool");
    const pts = spec.series[0].points;
    const windowTurns = DEFAULT_DURATIONS.house.generalDurationHours + 1;
    expect(pts).toHaveLength(windowTurns);
    expect(pts[windowTurns - 1][1]).toBeCloseTo(
      turnVoteWeight(windowTurns, windowTurns - 1, 100),
      3
    );
    expect(pts[windowTurns - 1][1]).toBeCloseTo((FINAL_POOL_SHARE * 100) / ELECTION_DAY_TURNS, 3);
    expect(pts.reduce((a, [, y]) => a + y, 0)).toBeCloseTo(100, 1);
  });

  it("presence chart uses the cost ladder and bonus curve", () => {
    const spec = chart("campaign-presence-cost-and-bonus");
    expect(spec.series[0].points[1][1]).toBe(stateOrgLevelCost(0));
    const primary = spec.series[1].points.find(([x]) => x === STATE_ORG_MAX_LEVEL)!;
    expect(primary[1]).toBeCloseTo(
      stateOrgBonusFraction(STATE_ORG_MAX_LEVEL) * MAX_STATE_ORG_BONUS_PRIMARY * 100,
      3
    );
    expect(spec.markers?.[0].x).toBe(STATE_ORG_MAX_LEVEL);
  });

  it("redistricting tiers match the cap table", () => {
    const spec = chart("redistricting-tier-limits");
    const loose = resolveRedistrictCaps(2, 2, 2, 3);
    expect(spec.series[0].points[2][1]).toBe(loose.maxDistrictDeviation);
    expect(spec.series[1].points[2][1]).toBe(loose.maxPackedDistricts);
    expect(spec.series[2].points[2][1]).toBeCloseTo(loose.efficiencyGapCeiling * 100, 6);
  });

  it("reporting, desire and canvassing markers use the game constants", () => {
    expect(
      chart("live-results-reporting-curve").markers?.some((m) => m.y === PRE_FINAL_REPORTING_CAP)
    ).toBe(true);
    expect(chart("independence-desire-drift").markers?.[0].y).toBe(REQUEST_THRESHOLD);
    expect(chart("canvassing-headroom").markers?.[0].y).toBe(TURNOUT_CAP);
    const band = chart("granular-poll-uncertainty").series[0].points;
    expect(band[band.length - 1][1]).toBe(BASE_UNCERTAINTY_BAND);
  });

  it("favorability charts follow the game functions", () => {
    const scalar = chart("favorability-vote-scalar").series[0].points.find(([x]) => x === 50)!;
    expect(scalar[1]).toBeCloseTo(approvalScalar(50), 4);
    const ads = chart("ad-favorability-gain").series[0].points.find(([x]) => x === 90)!;
    expect(ads[1]).toBe(advertiseFavorabilityGain(90));
    const decay = chart("targeted-ad-decay").series[0].points;
    expect(decay[0][1]).toBeCloseTo(AD_BONUS_CAP * 100, 3);
    expect(decay[decay.length - 1][1]).toBeLessThan(decay[0][1]);
  });
});
