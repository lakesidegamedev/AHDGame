/**
 * AI labour shock. Automation displaces work faster than labour markets adapt
 * in the countries where adoption is high and unemployment is rising. Each hit
 * government chooses retraining, wage insurance, a robot tax or laissez-faire;
 * the wave resolves as absorbed, reformed or entrenched, then rests before it
 * can hit again. Opening conditions and rolls live in `rules/futureConflicts.ts`.
 */
import type { GlobalResponseOutcome } from "@/lib/db/types/crisis";
import { choiceNode, responseOpt } from "../authoring";
import { cfx } from "../effects";
import { defaultRoleResolver } from "../roles";
import { AI_LABOUR_SHOCK_KEY } from "../rules/futureConflicts";
import type { ConflictEvent, ConflictPhase, LivingConflictDef, RoleDecisionTrees } from "../types";

const ACTIVE = ["displacement", "backlash"];
const RESTING = ["absorbed", "reformed", "entrenched"];

function trees(key: string): RoleDecisionTrees {
  return {
    belligerent: choiceNode(
      `${key}_labour_policy`,
      "Automation is displacing workers",
      "Firms are replacing routine work with AI systems faster than displaced workers find new jobs.",
      [
        responseOpt(
          "retraining_law",
          "Pass a retraining law",
          "Fund adult retraining, skills accounts and placement services for displaced workers.",
          { retraining: 4, reform: 1 },
          [],
          0.002
        ),
        responseOpt(
          "wage_insurance",
          "Introduce wage insurance",
          "Top up the pay of displaced workers who take lower-paid jobs while they retrain.",
          { support: 4 },
          [],
          0.003
        ),
        responseOpt(
          "robot_tax",
          "Levy a robot tax",
          "Tax automation that replaces payroll and use the revenue for transition support.",
          { tax: 4, reform: 1 },
          [cfx("flat", "metric", "economic", "gdpGrowth", -0.001, "Robot tax investment drag")]
        ),
        responseOpt(
          "laissez_faire",
          "Let the market adjust",
          "Take no new action and let firms and workers adapt on their own.",
          { market: 4 }
        ),
      ]
    ),
  };
}

const outcomes: GlobalResponseOutcome[] = [
  {
    outcomeId: "reform_package",
    label: "Full transition package",
    description: "Retraining and wage insurance together keep displaced workers attached to work.",
    priority: 70,
    conditions: [
      { axis: "retraining", min: 4 },
      { axis: "support", min: 4 },
    ],
    trackDeltas: { reform: 35, adjustment: 15, displacement: -12, backlash: -12 },
    effectsByRole: {
      belligerent: [
        cfx("flat", "metric", "economic", "unemploymentRate", -0.004, "Transition package"),
        cfx("flat", "approval", "government", "overall", 0.01, "Transition package"),
      ],
    },
    wireMessage: "A full transition package eases the AI labour shock.",
  },
  {
    outcomeId: "retraining_drive",
    label: "Retraining drive",
    description: "Funded retraining moves displaced workers into new jobs over time.",
    priority: 60,
    conditions: [{ axis: "retraining", min: 4 }],
    trackDeltas: { reform: 22, adjustment: 12, displacement: -8, backlash: -4 },
    effectsByRole: {
      belligerent: [
        cfx("flat", "metric", "economic", "unemploymentRate", -0.003, "Retraining placements"),
      ],
    },
    wireMessage: "Governments fund retraining for workers displaced by automation.",
  },
  {
    outcomeId: "wage_insurance",
    label: "Wage insurance",
    description: "Pay top-ups cushion displaced workers and take the edge off the backlash.",
    priority: 55,
    conditions: [{ axis: "support", min: 4 }],
    trackDeltas: { reform: 15, backlash: -14, displacement: -3 },
    effectsByRole: {
      belligerent: [
        cfx("flat", "metric", "economic", "wageGrowth", 0.002, "Wage insurance"),
        cfx("flat", "approval", "government", "overall", 0.01, "Wage insurance"),
      ],
    },
    wireMessage: "Wage insurance cushions workers displaced by automation.",
  },
  {
    outcomeId: "robot_tax",
    label: "Robot tax",
    description: "A levy on labour-replacing automation slows adoption and funds transition aid.",
    priority: 50,
    conditions: [{ axis: "tax", min: 4 }],
    trackDeltas: { reform: 12, adjustment: 6, displacement: -6, backlash: -6 },
    effectsByRole: {
      belligerent: [
        cfx("flat", "metric", "economic", "gdpGrowth", -0.002, "Robot tax"),
        cfx("flat", "approval", "government", "overall", 0.005, "Robot tax"),
      ],
    },
    wireMessage: "A robot tax slows automation and funds support for displaced workers.",
  },
  {
    outcomeId: "laissez_faire",
    label: "Market left to adjust",
    description: "Without new policy, displaced workers fall out of work and anger builds.",
    priority: 0,
    conditions: [],
    trackDeltas: { displacement: 8, backlash: 10, adjustment: 4 },
    effectsByRole: {
      belligerent: [
        cfx("flat", "metric", "economic", "unemploymentRate", 0.006, "Automation layoffs"),
        cfx("flat", "metric", "economic", "wageGrowth", -0.004, "Automation wage pressure"),
        cfx("flat", "approval", "government", "overall", -0.015, "Automation layoffs"),
        cfx("flat", "metric", "social", "socialCohesion", -0.02, "Anti-automation populism"),
      ],
    },
    wireMessage: "Automation layoffs spread while governments leave the market to adjust.",
  },
];

function responseEvent(phase: string, headline: string, body: string): ConflictEvent {
  return {
    key: `${phase}_response`,
    kind: "authored",
    severity: phase === "backlash" ? "critical" : "major",
    affects: ["belligerent"],
    trigger: { onPhaseEnter: true, everyTurns: 24 },
    headline,
    body,
    response: {
      windowTurns: 24,
      decisionTrees: trees(phase),
      defaultOptionIdByRole: { belligerent: "laissez_faire" },
      outcomes,
      defaultOutcomeId: "laissez_faire",
    },
  };
}

/** Follow-up choices once a wave resolves; doing nothing costs nothing. */
const aftermathOutcomes: GlobalResponseOutcome[] = [
  {
    outcomeId: "lasting_reform",
    label: "Lasting retraining system",
    description:
      "Permanent retraining funding leaves the country better prepared for the next wave.",
    priority: 50,
    conditions: [{ axis: "retraining", min: 4 }],
    trackDeltas: { reform: 10 },
    effectsByRole: {
      belligerent: [
        cfx("flat", "metric", "economic", "unemploymentRate", -0.002, "Lasting retraining"),
      ],
    },
    wireMessage: "Governments make retraining for automated work permanent.",
  },
  {
    outcomeId: "lasting_support",
    label: "Lasting income support",
    description: "Wage insurance stays in place, calming fears of the next wave.",
    priority: 45,
    conditions: [{ axis: "support", min: 4 }],
    trackDeltas: { backlash: -10 },
    effectsByRole: {
      belligerent: [cfx("flat", "approval", "government", "overall", 0.005, "Wage insurance")],
    },
    wireMessage: "Governments keep wage insurance after the AI labour shock.",
  },
  {
    outcomeId: "no_follow_up",
    label: "No follow-up",
    description: "Governments move on without new labour policy.",
    priority: 0,
    conditions: [],
    wireMessage: "Governments move on from the AI labour shock without new policy.",
  },
];

function restingPhase(level: number, key: string, label: string, summary: string): ConflictPhase {
  return {
    level,
    key,
    label,
    summary,
    advancePressure: 100,
    decisionTrees: trees(key),
    events: [
      {
        key: `${key}_entry`,
        kind: "authored",
        severity: "major",
        affects: ["belligerent"],
        trigger: { onPhaseEnter: true },
        headline: `AI labour shock: ${label.toLowerCase()}`,
        body: `${summary} Governments can still lock in reforms before the next wave.`,
        response: {
          windowTurns: 24,
          decisionTrees: trees(key),
          defaultOptionIdByRole: { belligerent: "laissez_faire" },
          outcomes: aftermathOutcomes,
          defaultOutcomeId: "no_follow_up",
        },
      },
    ],
  };
}

export const AI_LABOUR_SHOCK_DEF: LivingConflictDef = {
  key: AI_LABOUR_SHOCK_KEY,
  type: "disaster",
  name: "AI Labour Shock",
  fromYear: 2029,
  autoOpen: true,
  minimumOpeningPressure: 1,
  participants: { belligerents: [], neighbors: [], blocMembers: [], bystanders: [] },
  roleResolver: defaultRoleResolver,
  tracks: {
    displacement: { initial: 30 },
    backlash: { initial: 10 },
    adjustment: { initial: 0 },
    reform: { initial: 0 },
    waveSignal: { initial: 0, max: 1000 },
    recoveryTurns: { initial: 0, max: 500 },
  },
  scheduledPressures: [
    {
      key: "displacement_spreads",
      everyTurns: 4,
      phaseKeys: ["displacement"],
      trackDeltas: { displacement: 2, backlash: 2 },
    },
    {
      key: "backlash_hardens",
      everyTurns: 4,
      phaseKeys: ["backlash"],
      trackDeltas: { backlash: 1, displacement: -1 },
    },
    {
      // Guaranteed resolution: labour markets adapt even with no policy.
      key: "labour_market_adjustment",
      everyTurns: 2,
      phaseKeys: ACTIVE,
      trackDeltas: { adjustment: 1 },
    },
    { key: "wave_active", phaseKeys: ACTIVE, trackDeltas: { recoveryTurns: -1000 } },
    {
      key: "wave_rests",
      phaseKeys: RESTING,
      trackDeltas: { recoveryTurns: 1, adjustment: -1, reform: -1, backlash: -1, displacement: -1 },
    },
  ],
  transitions: [
    {
      key: "reform_from_displacement",
      fromPhase: "displacement",
      toPhase: "reformed",
      toStatus: "settled",
      priority: 90,
      conditions: [
        { track: "reform", min: 60 },
        { track: "displacement", max: 50 },
      ],
    },
    {
      key: "reform_from_backlash",
      fromPhase: "backlash",
      toPhase: "reformed",
      toStatus: "settled",
      priority: 90,
      conditions: [
        { track: "reform", min: 60 },
        { track: "backlash", max: 50 },
      ],
    },
    {
      key: "backlash_erupts",
      fromPhase: "displacement",
      toPhase: "backlash",
      priority: 60,
      conditions: [{ track: "backlash", min: 55 }],
    },
    {
      key: "backlash_subsides",
      fromPhase: "backlash",
      toPhase: "displacement",
      priority: 60,
      conditions: [{ track: "backlash", max: 30 }],
    },
    {
      key: "absorbed",
      fromPhase: "displacement",
      toPhase: "absorbed",
      toStatus: "settled",
      priority: 40,
      conditions: [{ track: "adjustment", min: 80 }],
    },
    {
      key: "entrenched",
      fromPhase: "backlash",
      toPhase: "entrenched",
      toStatus: "settled",
      priority: 40,
      conditions: [{ track: "adjustment", min: 80 }],
    },
    ...RESTING.map((fromPhase) => ({
      key: `new_wave_after_${fromPhase}`,
      fromPhase,
      toPhase: "displacement",
      toStatus: "active" as const,
      priority: 100,
      conditions: [
        { track: "recoveryTurns", min: 96 },
        { track: "waveSignal", min: 1 },
      ],
    })),
  ],
  phases: [
    {
      level: 1,
      key: "displacement",
      label: "Displacement wave",
      summary: "AI systems are replacing routine work faster than workers find new jobs.",
      advancePressure: 100,
      decisionTrees: trees("displacement"),
      events: [
        responseEvent(
          "displacement",
          "AI automation triggers a wave of layoffs",
          "Offices, call centres and warehouses are cutting staff as AI systems take over routine work. Unemployment is rising."
        ),
      ],
    },
    {
      level: 2,
      key: "backlash",
      label: "Populist backlash",
      summary: "Displaced workers turn against the government and the firms that automated.",
      advancePressure: 100,
      decisionTrees: trees("backlash"),
      events: [
        responseEvent(
          "backlash",
          "Anti-automation backlash sweeps national politics",
          "Protests, strikes and populist campaigns target AI adoption. Governments that do nothing face an angry electorate."
        ),
      ],
    },
    restingPhase(
      3,
      "absorbed",
      "Absorbed",
      "The labour market has absorbed the shock. New kinds of work have replaced most of the jobs that were lost."
    ),
    restingPhase(
      4,
      "reformed",
      "Reformed",
      "Reforms have rebuilt the safety net and retraining system around an automated economy."
    ),
    restingPhase(
      5,
      "entrenched",
      "Entrenched",
      "The shock has passed, but long-term unemployment and anti-automation politics have taken root."
    ),
  ],
};
