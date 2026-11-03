import {
  MERGER_REVIEW_THRESHOLD_PERCENT,
  MERGER_REVIEW_REMEDY_MARGIN_PERCENT,
  MERGER_REVIEW_BLOCK_MARGIN_PERCENT,
  autoResolveDecision,
  type MergerReviewDecision,
} from "@/lib/corporations/mergerReview/constants";
import {
  computeGroupSynergies,
  GROUP_SYNERGY_MAX_SHARE,
  SPINOFF_SYNERGY_MAX_SHARE,
  type SynergyMember,
} from "@/lib/corporations/groups/synergies";
import {
  ACCRUAL_RATE,
  CONSISTENCY_BAND,
  DECAY_GOUGE,
  GOUGE_JUMP,
  LOYALTY_MAX,
  loyaltyLabel,
  updateBrandLoyalty,
} from "@/lib/market/brandLoyalty";
import {
  QUALITY_NEUTRAL_INPUT,
  QUALITY_OPS_REF,
  QUALITY_TECH_REF,
  computeSectorQuality,
} from "@/lib/market/brandQuality";
import {
  DOMINANCE_MARKET_SHARE_THRESHOLD,
  UNDERDOG_ATTACKER_FULL_BONUS_SHARE,
  UNDERDOG_ATTACKER_NO_BONUS_SHARE,
  UNDERDOG_DEFENDER_MIN_SHARE,
  getDominanceAttackEaseMultiplier,
  getUnderdogAttackAmplifier,
} from "@/lib/constants/corporations";
import { ECONOMY_CORP_GROWTH_CHARTS } from "./economyCorpGrowth";
import { ECONOMY_TRADE_CHARTS } from "./economyTrade";
import { ECONOMY_LABOUR_CHARTS } from "./economyLabour";
import { ECONOMY_CORP_PRICING_CHARTS } from "./economyCorpPricing";
import type { WikiChartBuilder, WikiChartSpec } from "./types";

const round = (n: number, dp = 4) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) out.push(round(from + i * step, 6));
  return out;
};

// ── Corporate mergers: what a merger review does if left to time out ────────

const MERGER_OUTCOME_CODE: Record<MergerReviewDecision, number> = {
  cleared: 0,
  clearedWithRemedy: 1,
  blocked: 2,
};

export function buildMergerReviewOutcomes(): WikiChartSpec {
  const levels = MERGER_REVIEW_THRESHOLD_PERCENT.map((t, level) => ({ t, level })).filter(
    (e): e is { t: number; level: number } => e.t !== null
  );
  return {
    title: "Merger review: what happens if the review times out",
    kind: "step",
    xLabel: "Combined national industry share after the merger (%)",
    yLabel: "Outcome (0 clears, 1 sell-down ordered, 2 blocked)",
    series: levels.map(({ t, level }) => ({
      name: `Review trips at ${t}% (antitrust level ${level})`,
      points: range(0, 100, 1).map((share): [number, number] => [
        share,
        MERGER_OUTCOME_CODE[autoResolveDecision(share, t)],
      ]),
    })),
    markers: [
      {
        y: MERGER_OUTCOME_CODE.clearedWithRemedy,
        label: `Sell-down from ${MERGER_REVIEW_REMEDY_MARGIN_PERCENT} points over the trip level`,
      },
      {
        y: MERGER_OUTCOME_CODE.blocked,
        label: `Blocked from ${MERGER_REVIEW_BLOCK_MARGIN_PERCENT} points over the trip level`,
      },
    ],
    caption:
      "When nobody decides, a deal clears just over the trip level, must sell down the overlap a little further out, and is blocked well beyond it. Stricter antitrust laws trip earlier.",
  };
}

// ── Subsidiary corporations: group synergy convergence ──────────────────────

export function buildGroupSynergyConvergence(): WikiChartSpec {
  const LEADER_STRENGTH = 100;
  const LEADER = "leader";
  const TURNS = 100;
  const simulate = (spinOff: boolean): [number, number][] => {
    const member: SynergyMember = {
      corporationId: "member",
      marketingStrength: 0,
      logisticsStrength: 0,
      isSpinOff: spinOff,
      spunOffFromCorpId: spinOff ? LEADER : undefined,
      spunOffAtTurn: spinOff ? 0 : undefined,
    };
    const points: [number, number][] = [[0, 0]];
    for (let turn = 0; turn < TURNS; turn++) {
      const deltas = computeGroupSynergies(
        [
          {
            corporationId: LEADER,
            marketingStrength: LEADER_STRENGTH,
            logisticsStrength: LEADER_STRENGTH,
          },
          member,
        ],
        turn
      );
      const d = deltas.find((x) => x.corporationId === "member");
      if (d) {
        member.marketingStrength += d.marketingStrength;
        member.logisticsStrength += d.logisticsStrength;
      }
      points.push([turn + 1, round((member.marketingStrength / LEADER_STRENGTH) * 100, 2)]);
    }
    return points;
  };
  return {
    title: "How a group member catches up to its leader",
    kind: "line",
    xLabel: "Turns after joining the group",
    yLabel: "Marketing and logistics strength (% of the group leader)",
    unit: "%",
    series: [
      { name: "Ordinary member", points: simulate(false) },
      { name: "Recent spin-off of a group member", points: simulate(true) },
    ],
    markers: [
      {
        y: GROUP_SYNERGY_MAX_SHARE * 100,
        label: "Ceiling for an ordinary member",
      },
      {
        y: SPINOFF_SYNERGY_MAX_SHARE * 100,
        label: "Ceiling for a recent spin-off",
      },
    ],
    caption:
      "A member closes a fixed slice of the gap each turn, so the climb is fast at first and slows near the ceiling. A member is never pulled down to the group average.",
  };
}

// ── Brand loyalty: how long does a tier take ────────────────────────────────

export function buildBrandLoyaltyTiers(): WikiChartSpec {
  const TURNS = 100;
  const DIVERGE_TURN = 40;
  const FILL = 0.8;
  const BASE_POSTURE = 1.0;
  const GOUGE_POSTURE = BASE_POSTURE + GOUGE_JUMP * 1.25;
  const ERRATIC_SWING = 0.12;

  const simulate = (
    postureAt: (t: number) => number,
    contestedAt: (t: number) => boolean
  ): [number, number][] => {
    let loyalty = 0;
    let norm: number | null = null;
    const points: [number, number][] = [];
    for (let t = 0; t <= TURNS; t++) {
      points.push([t, round(loyalty, 2)]);
      const r = updateBrandLoyalty({
        loyalty,
        postureNorm: norm,
        posture: postureAt(t),
        fill: FILL,
        contested: contestedAt(t),
      });
      loyalty = r.loyalty;
      norm = r.postureNorm;
    }
    return points;
  };

  const markers: { y: number; label: string }[] = [];
  let last = loyaltyLabel(0);
  for (let v = 1; v <= LOYALTY_MAX; v++) {
    const label = loyaltyLabel(v);
    if (label !== last) markers.push({ y: v, label: `${label} tier starts` });
    last = label;
  }

  return {
    title: "How long does a brand loyalty tier take?",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Brand loyalty (0 to 100)",
    series: [
      {
        name: "Steady, contested pricing",
        points: simulate(
          () => BASE_POSTURE,
          () => true
        ),
      },
      {
        name: `One price gouge at turn ${DIVERGE_TURN}`,
        points: simulate(
          (t) => (t === DIVERGE_TURN ? GOUGE_POSTURE : BASE_POSTURE),
          () => true
        ),
      },
      {
        name: `Erratic pricing from turn ${DIVERGE_TURN}`,
        points: simulate(
          (t) =>
            t >= DIVERGE_TURN && (t - DIVERGE_TURN) % 2 === 1
              ? BASE_POSTURE + ERRATIC_SWING
              : BASE_POSTURE,
          () => true
        ),
      },
      {
        name: `Idle from turn ${DIVERGE_TURN} (no rival undercutting)`,
        points: simulate(
          () => BASE_POSTURE,
          (t) => t < DIVERGE_TURN
        ),
      },
    ],
    markers,
    caption: `Steady pricing earns ${ACCRUAL_RATE} point per turn. A single gouge costs ${DECAY_GOUGE} points, and prices that drift more than ${CONSISTENCY_BAND * 100}% from your own norm keep eating loyalty. Horizontal lines mark where each tier begins.`,
  };
}

// ── Output quality: the four pillars ────────────────────────────────────────

export function buildOutputQualityPillars(): WikiChartSpec {
  const OUTPUT = ["steel"] as const;
  const par = {
    techScore: QUALITY_TECH_REF,
    wageLevel: 1,
    operationsStrength: QUALITY_OPS_REF,
    inputQuality: QUALITY_NEUTRAL_INPUT,
    outputCommodities: OUTPUT,
  };
  const levels = range(0, 200, 10);
  const line = (build: (pct: number) => Partial<typeof par>): [number, number][] =>
    levels.map((pct): [number, number] => [
      pct,
      computeSectorQuality({ ...par, ...build(pct) }) ?? 0,
    ]);
  return {
    title: "Output quality against each production pillar",
    kind: "line",
    xLabel: "Pillar level (% of par; the other three pillars stay at par)",
    yLabel: "Output quality score",
    unit: "points",
    series: [
      { name: "Technology", points: line((p) => ({ techScore: (QUALITY_TECH_REF * p) / 100 })) },
      {
        name: "Input quality",
        points: line((p) => ({ inputQuality: Math.min(100, (QUALITY_NEUTRAL_INPUT * p) / 100) })),
      },
      { name: "Wages", points: line((p) => ({ wageLevel: p / 100 })) },
      {
        name: "Operations",
        points: line((p) => ({ operationsStrength: (QUALITY_OPS_REF * p) / 100 })),
      },
    ],
    caption:
      "Technology moves quality the most. Every pillar has diminishing returns, and a weak pillar can be made up by the others.",
  };
}

// ── Corporations: attacking rivals ──────────────────────────────────────────

export function buildDominanceUnderdog(): WikiChartSpec {
  const DEFENDER_SHARE = 75;
  const shares = range(0, 100, 1);
  return {
    title: "Why dominant corporations are easier to attack",
    kind: "line",
    xLabel: "Market share (%)",
    yLabel: "Attack multiplier",
    unit: "x",
    series: [
      {
        name: "Dominance: attack ease against a defender with this share",
        points: shares.map((s): [number, number] => [
          s,
          round(getDominanceAttackEaseMultiplier(s)),
        ]),
      },
      {
        name: `Underdog bonus for an attacker with this share (against a ${DEFENDER_SHARE}% defender)`,
        points: shares.map((s): [number, number] => [
          s,
          round(getUnderdogAttackAmplifier(s, DEFENDER_SHARE)),
        ]),
      },
    ],
    markers: [
      { x: DOMINANCE_MARKET_SHARE_THRESHOLD, label: "Dominance starts to count" },
      {
        x: UNDERDOG_ATTACKER_FULL_BONUS_SHARE,
        label: "Underdog bonus at its maximum up to here",
      },
      {
        x: UNDERDOG_ATTACKER_NO_BONUS_SHARE,
        label: "Underdog bonus is gone from here",
      },
    ],
    caption: `Defenders above ${UNDERDOG_DEFENDER_MIN_SHARE}% share are the only ones a small attacker gets a bonus against. Dominance ease climbs slowly at first and steeply near a monopoly.`,
  };
}

export const ECONOMY_CORP_CHARTS: Record<string, WikiChartBuilder> = {
  "merger-review-timeout-outcomes": buildMergerReviewOutcomes,
  "group-synergy-convergence": buildGroupSynergyConvergence,
  "brand-loyalty-tiers-over-time": buildBrandLoyaltyTiers,
  "output-quality-pillars": buildOutputQualityPillars,
  "dominance-and-underdog-attack": buildDominanceUnderdog,
  ...ECONOMY_CORP_PRICING_CHARTS,
  ...ECONOMY_LABOUR_CHARTS,
  ...ECONOMY_CORP_GROWTH_CHARTS,
  ...ECONOMY_TRADE_CHARTS,
};
