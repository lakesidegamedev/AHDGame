import {
  ACTING_APPOINTMENT_PENALTY,
  emptyCabinetSeatsModifier,
} from "@/lib/country/rules/approvalHoneymoon";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  MAX_CONTRIBUTION,
  metricApprovalContribution,
} from "@/lib/utils/approvalContributionRules";
import {
  LEGISLATIVE_APPROVAL_VOTE_SLOPE,
  PRESIDENTIAL_APPROVAL_VOTE_SLOPE,
  approvalVoteMultiplier,
} from "@/lib/electionEngine/approvalVoteMultiplier";
import { WAR_EXHAUSTION_FLOOR, warExhaustion } from "@/lib/military/rules/warExhaustionCurve";
import {
  PENSION_ACCRUAL_RATE,
  PENSION_DEFICIT_RATIO,
  pensionAccrualForTurn,
  pensionContributionForTurn,
  pensionFundingRatio,
  pensionTopUpForTurn,
} from "@/lib/pensions/rules";
import { BILL_PROPOSE_ACTION_COST, getProvisionCostTotal } from "@shared/constants/legislation";
import {
  MAX_EFFECT_PER_LAW,
  NATIONAL_LAW_DECAY_MULTIPLIER,
  POLICY_TAU,
  applyHalfLifeDecay,
  applyPolicyDecay,
  calculatePolicyContribution,
  nationalDecayScope,
} from "@shared/constants/formulas";
import { clotureVotesRequired } from "@/lib/turn/billLifecycle/clotureRules";
import { didPass } from "@/lib/billLifecycleHelpers";
import { isOfficePoolAccrualTurn } from "@/lib/actions/officePoolAccrual";
import {
  MINISTERIAL_ACTION_ACCRUAL_TURNS,
  MINISTERIAL_ACTION_CAP,
} from "@/lib/constants/cabinetMechanicsTypes";
import { driftCondition, fundingDef } from "@/lib/constants/cabinetEstates";
import { assessCourtConcentration } from "@/lib/governanceStyle/competition";
import { calculateNppWhipSuccessChance } from "@/lib/partyWhips/whipSuccess";
import type { WikiChartBuilder, WikiChartSpec } from "./types";

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
};
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

function approvalMetricContribution(): WikiChartSpec {
  return {
    title: "How much one metric moves approval",
    kind: "line",
    xLabel: "Gap from the national average (percent, in the good direction)",
    yLabel: "Approval points from this metric",
    unit: "points",
    series: [
      {
        name: "Contribution",
        points: range(-30, 30, 1).map((gap) => [gap, r4(metricApprovalContribution(gap / 100))]),
      },
    ],
    markers: [
      { y: MAX_CONTRIBUTION, label: "Most one metric can add" },
      { y: -MAX_CONTRIBUTION, label: "Most one metric can take away" },
    ],
    caption:
      "A metric stops counting extra once it is about 13 percent better or worse than average.",
  };
}

function approvalVotePool(): WikiChartSpec {
  const xs = range(0, 100, 5);
  return {
    title: "How approval changes the size of the vote pool",
    kind: "line",
    xLabel: "Government approval (percent)",
    yLabel: "Vote pool multiplier",
    unit: "x",
    series: [
      {
        name: "Presidential elections",
        points: xs.map((a) => [
          a,
          r4(approvalVoteMultiplier(a / 100, PRESIDENTIAL_APPROVAL_VOTE_SLOPE)),
        ]),
      },
      {
        name: "Legislative elections",
        points: xs.map((a) => [
          a,
          r4(approvalVoteMultiplier(a / 100, LEGISLATIVE_APPROVAL_VOTE_SLOPE)),
        ]),
      },
    ],
    markers: [{ x: 50, label: "50 percent approval: no change" }],
    caption: "Presidential pools swing much harder with approval than legislative ones.",
  };
}

const SAMPLE_CABINET_SEATS = 10;

function cabinetApprovalDrag(): WikiChartSpec {
  const shares = range(0, 100, 10);
  const emptyPenalty = (shareEmpty: number) => {
    const empty = Math.round((shareEmpty / 100) * SAMPLE_CABINET_SEATS);
    const mod = emptyCabinetSeatsModifier(SAMPLE_CABINET_SEATS - empty, SAMPLE_CABINET_SEATS);
    return mod ? mod.effect : 0;
  };
  return {
    title: "Approval penalty for an empty or acting cabinet",
    kind: "line",
    xLabel: "Share of a 10 seat cabinet that is empty (or held by acting secretaries)",
    yLabel: "National approval change",
    unit: "points",
    series: [
      { name: "Empty seats", points: shares.map((s) => [s, r4(emptyPenalty(s))]) },
      {
        name: "Acting secretaries",
        points: shares.map((s) => [
          s,
          r4(-Math.round((s / 100) * SAMPLE_CABINET_SEATS) * ACTING_APPOINTMENT_PENALTY),
        ]),
      },
    ],
    caption: "Leaving seats empty costs far more than seating acting secretaries in them.",
  };
}

function warExhaustionCurve(): WikiChartSpec {
  const years = range(0, 30, 1);
  return {
    title: "War exhaustion over the years of a war",
    kind: "line",
    xLabel: "Game years since the war began",
    yLabel: "National approval change",
    unit: "points",
    series: [
      { name: "War exhaustion", points: years.map((y) => [y, warExhaustion(y * TURNS_PER_YEAR)]) },
    ],
    markers: [{ y: WAR_EXHAUSTION_FLOOR, label: "Floor" }],
    caption: "A fresh war helps slightly. Each year of fighting costs a point, down to the floor.",
  };
}

function pensionFundingByRate(): WikiChartSpec {
  const wageBill = 1;
  const rates = [0.04, 0.06, 0.08, 0.12];
  const turns = 192;
  const series = rates.map((rate) => {
    let assets = 0;
    let liabilities = 0;
    const points: [number, number][] = [[0, 100]];
    for (let t = 1; t <= turns; t++) {
      // Same order as the pension turn: contribution, then the top-up measured
      // against last turn's claims, then this turn's accrual.
      assets += pensionContributionForTurn({ coveredWageBill: wageBill, contributionRate: rate });
      assets += pensionTopUpForTurn({ assetsAnchor: assets, liabilitiesAnchor: liabilities });
      liabilities += pensionAccrualForTurn(wageBill);
      if (t % 4 === 0) points.push([t, r4(pensionFundingRatio(assets, liabilities) * 100)]);
    }
    return { name: `${Math.round(rate * 100)} percent contribution`, points };
  });
  return {
    title: "Pension funding over time by contribution rate",
    kind: "line",
    xLabel: "Turns since the scheme started",
    yLabel: "Funding ratio (percent of promised pensions)",
    unit: "%",
    series,
    markers: [
      { y: 110, label: "Above this: surplus" },
      { y: PENSION_DEFICIT_RATIO * 100, label: "Below this: deficit and top-ups" },
      { y: 60, label: "Below this: critical" },
    ],
    caption: `Contributions below the ${Math.round(PENSION_ACCRUAL_RATE * 100)} percent accrual rate leave the scheme short. Benefits and investment returns are ignored.`,
  };
}

function billProvisionCost(): WikiChartSpec {
  const counts = [1, 2, 3];
  return {
    title: "What proposing a bill costs",
    kind: "bar",
    xLabel: "Provisions in the bill",
    yLabel: "Cost",
    categories: counts.map((n) => `${n} ${n === 1 ? "provision" : "provisions"}`),
    series: [
      {
        name: "National influence (total)",
        points: counts.map((n, i) => [i, getProvisionCostTotal(n)]),
      },
      {
        name: "Action points (flat)",
        points: counts.map((_, i) => [i, BILL_PROPOSE_ACTION_COST]),
      },
    ],
    caption:
      "Each extra provision costs more national influence than the last. The action point cost never changes.",
  };
}

function whipSuccessByLoyalty(): WikiChartSpec {
  const stubbornness = 50;
  const loyalties = range(0, 100, 5);
  const chance = (loyalty: number, mode: "soft" | "hard") =>
    calculateNppWhipSuccessChance(
      { personality: { loyalty, stubbornness } } as Parameters<
        typeof calculateNppWhipSuccessChance
      >[0],
      mode
    ).finalChance;
  return {
    title: "Chance an NPP follows your whip",
    kind: "line",
    xLabel: "NPP loyalty",
    yLabel: "Whip success chance (percent)",
    unit: "%",
    series: [
      { name: "Hard whip", points: loyalties.map((l) => [l, chance(l, "hard")]) },
      { name: "Soft whip", points: loyalties.map((l) => [l, chance(l, "soft")]) },
    ],
    caption:
      "Shown for an NPP with middling stubbornness. Hard whips beat soft whips at every loyalty.",
  };
}

function clotureBar(): WikiChartSpec {
  const casts = range(1, 100, 1);
  const simple = (cast: number) => {
    for (let f = 0; f <= cast; f++) if (didPass(f, cast - f)) return f;
    return cast;
  };
  const sample = 57;
  return {
    title: "Votes needed to pass: simple majority versus cloture",
    kind: "line",
    xLabel: "Total votes cast (for, against and abstain)",
    yLabel: "For votes required",
    unit: "votes",
    series: [
      { name: "Simple majority", points: casts.map((c) => [c, simple(c)]) },
      {
        name: "After a filibuster (cloture)",
        points: casts.map((c) => [c, clotureVotesRequired(c)]),
      },
      { name: `A bill with ${sample} For votes`, points: casts.map((c) => [c, sample]) },
    ],
    caption:
      "Abstentions raise the cloture bar, so 57 For votes can pass or fail depending on how many senators vote.",
  };
}

function policyEffectOverTime(): WikiChartSpec {
  const nationalTarget = calculatePolicyContribution(3, 1, nationalDecayScope(0), true);
  const stateTarget = calculatePolicyContribution(3, 1, 1, true);
  const horizon = 480;
  const walk = (target: number) => {
    let v = 0;
    const pts: [number, number][] = [[0, 0]];
    for (let t = 1; t <= horizon; t++) {
      v = applyPolicyDecay(v, target, POLICY_TAU);
      if (t % 8 === 0) pts.push([t, r4(v)]);
    }
    return pts;
  };
  return {
    title: "How a law's effect builds up over time",
    kind: "line",
    xLabel: "Turns since the law was enacted",
    yLabel: "Metric movement",
    unit: "points",
    series: [
      { name: "State law (strongest setting)", points: walk(stateTarget) },
      { name: "National law (strongest setting)", points: walk(nationalTarget) },
    ],
    markers: [{ x: POLICY_TAU, label: "About 63 percent of the way there" }],
    caption: `A national law moves a metric about ${Math.round(NATIONAL_LAW_DECAY_MULTIPLIER * 100)} percent as far as a state law, out of a ${MAX_EFFECT_PER_LAW} point maximum.`,
  };
}

function policyAdaptation(): WikiChartSpec {
  const halfLives = [24, 48, 96];
  const turns = range(0, 192, 4);
  return {
    title: "How fast the economy adapts to a law",
    kind: "line",
    xLabel: "Turns since the law was enacted",
    yLabel: "Effect remaining (percent)",
    unit: "%",
    series: halfLives.map((h) => ({
      name: `Half-life ${h} turns`,
      points: turns.map((t) => [t, r4(applyHalfLifeDecay(1, t, h) * 100)] as [number, number]),
    })),
    markers: [{ y: 50, label: "Half the effect left" }],
    caption: "Laws with an adaptation half-life lose half their effect every half-life.",
  };
}

function ministerialActionBank(): WikiChartSpec {
  const spent = 2;
  const turns = range(0, 24, 1);
  let bank = MINISTERIAL_ACTION_CAP - spent;
  const points: [number, number][] = [];
  for (const t of turns) {
    if (t > 0 && isOfficePoolAccrualTurn(t, MINISTERIAL_ACTION_ACCRUAL_TURNS)) {
      bank = Math.min(MINISTERIAL_ACTION_CAP, bank + 1);
    }
    points.push([t, bank]);
  }
  return {
    title: "Cabinet action bank after spending two orders",
    kind: "step",
    xLabel: "Turns",
    yLabel: "Ministerial actions banked",
    unit: "actions",
    series: [{ name: "Actions banked", points }],
    markers: [{ y: MINISTERIAL_ACTION_CAP, label: "Bank cap" }],
    caption: `One action returns every ${MINISTERIAL_ACTION_ACCRUAL_TURNS} turns until the bank is full again.`,
  };
}

function estateCondition(): WikiChartSpec {
  const start = fundingDef("standard").conditionBaseline;
  const walk = (level: "enhanced" | "reduced") => {
    let c = start;
    const pts: [number, number][] = [[0, c]];
    for (let t = 1; t <= 40; t++) {
      c = driftCondition(c, level);
      pts.push([t, c]);
    }
    return pts;
  };
  return {
    title: "Estate condition after a funding change",
    kind: "line",
    xLabel: "Turns since the funding level changed",
    yLabel: "Estate condition",
    unit: "points",
    series: [
      { name: "Switched to Enhanced", points: walk("enhanced") },
      { name: "Switched to Reduced", points: walk("reduced") },
    ],
    markers: [
      { y: fundingDef("enhanced").conditionBaseline, label: "Enhanced baseline" },
      { y: start, label: "Standard baseline" },
      { y: fundingDef("reduced").conditionBaseline, label: "Reduced baseline" },
    ],
    caption: "Condition moves a few points per turn toward the baseline of the new funding level.",
  };
}

function courtConcentration(): WikiChartSpec {
  const bench = 9;
  const blocs = range(5, bench, 1);
  const penalty = (bloc: number) =>
    assessCourtConcentration(
      Array.from({ length: bench }, (_, i) =>
        i < bloc ? { economicLean: -5, socialLean: -5 } : { economicLean: 0, socialLean: 0 }
      )
    ).courtPenalty;
  return {
    title: "Court concentration penalty on a nine seat bench",
    kind: "line",
    xLabel: "Seats held by the largest bloc",
    yLabel: "Democratic health penalty",
    unit: "points",
    series: [{ name: "Penalty", points: blocs.map((b) => [b, penalty(b)]) }],
    caption:
      "A bloc of six of nine costs nothing. Past that the penalty climbs to its maximum for a unanimous bench.",
  };
}

export const LEGISLATURE_CHARTS: Record<string, WikiChartBuilder> = {
  "approval-metric-contribution": approvalMetricContribution,
  "approval-vote-pool-multiplier": approvalVotePool,
  "cabinet-approval-drag": cabinetApprovalDrag,
  "war-exhaustion-curve": warExhaustionCurve,
  "pension-funding-by-rate": pensionFundingByRate,
  "bill-provision-cost": billProvisionCost,
  "whip-success-by-loyalty": whipSuccessByLoyalty,
  "cloture-votes-required": clotureBar,
  "policy-effect-over-time": policyEffectOverTime,
  "policy-adaptation-decay": policyAdaptation,
  "ministerial-action-bank": ministerialActionBank,
  "estate-condition-drift": estateCondition,
  "court-concentration-penalty": courtConcentration,
};
