/**
 * Infrastructure cyberattack. State-backed intrusions into power grids and
 * networks, more likely when world tension is high and a country's cyber
 * resilience (`cyber/rules.ts`: mandate law, technology, utilities) is low. An intrusion can be contained before it causes outages; an
 * outage always moves into restoration as crews repair systems. Opening
 * conditions and rolls live in `rules/futureConflicts.ts`.
 */
import type { CrisisEffect, GlobalResponseOutcome } from "@/lib/db/types/crisis";
import { choiceNode, responseOpt } from "../authoring";
import { cfx } from "../effects";
import { defaultRoleResolver } from "../roles";
import { INFRASTRUCTURE_CYBERATTACK_KEY } from "../rules/futureConflicts";
import type { ConflictEvent, LivingConflictDef, RoleDecisionTrees } from "../types";

const ACTIVE = ["intrusion", "outage", "restoration"];

/** Outages stop plants as well as hurting growth: a physical output haircut. */
function outputLoss(points: number): CrisisEffect {
  return {
    effectType: "flat",
    targetType: "profitMargin",
    metricCategory: null,
    metricField: null,
    value: -points,
    sectorType: null,
    strategyId: null,
    label: "Cyberattack outages",
    physicality: "physical",
  };
}

function trees(key: string): RoleDecisionTrees {
  return {
    belligerent: choiceNode(
      `${key}_cyber_response`,
      "Critical infrastructure under attack",
      "Intruders are inside power and network systems. The government must decide how to respond.",
      [
        responseOpt(
          "resilience_mandate",
          "Order a resilience mandate",
          "Require grid and network operators to isolate, patch and back up critical systems.",
          { hardening: 4 },
          [],
          0.002
        ),
        responseOpt(
          "cyber_command",
          "Unleash cyber command",
          "Defend networks and disrupt the attackers' infrastructure.",
          { hardening: 2, retaliation: 3 },
          [],
          0.003
        ),
        responseOpt(
          "public_attribution",
          "Publicly attribute the attack",
          "Release evidence naming those responsible.",
          { attribution: 4 }
        ),
        responseOpt(
          "cyber_sanctions",
          "Impose sanctions on those responsible",
          "Freeze assets and restrict travel for the groups and officials behind the attack.",
          { sanctions: 3, attribution: 1 }
        ),
        responseOpt("absorb", "Absorb the damage", "Leave operators to recover on their own.", {}),
      ]
    ),
  };
}

function outcomes(phase: "intrusion" | "outage"): GlobalResponseOutcome[] {
  const outage = phase === "outage";
  const damage = (scale: number) =>
    outage
      ? [
          cfx(
            "flat",
            "metric",
            "infrastructure",
            "powerGridReliability",
            -0.03 * scale,
            "Grid outages"
          ),
          cfx("flat", "metric", "economic", "gdpGrowth", -0.003 * scale, "Outage output loss"),
          outputLoss(2 * scale),
        ]
      : [];
  return [
    {
      outcomeId: "hardened",
      label: "Systems hardened",
      description: "Operators isolate and patch critical systems, shutting intruders out.",
      priority: 60,
      conditions: [{ axis: "hardening", min: 4 }],
      trackDeltas: outage
        ? { hardening: 30, restoration: 20, outage: -10 }
        : { hardening: 30, intrusion: -15 },
      effectsByRole: { belligerent: damage(0.5) },
      wireMessage: "Governments harden critical infrastructure against a cyber campaign.",
    },
    {
      outcomeId: "counter_operation",
      label: "Counter-operation",
      description: "Cyber command disrupts the attackers' servers, at a diplomatic cost.",
      priority: 55,
      conditions: [{ axis: "retaliation", min: 3 }],
      trackDeltas: outage
        ? { intrusion: -12, restoration: 10, hardening: 10 }
        : { intrusion: -12, hardening: 10 },
      tensionDelta: 4,
      effectsByRole: { belligerent: damage(0.75) },
      wireMessage:
        "A cyber counter-operation disrupts the attackers behind infrastructure attacks.",
    },
    {
      outcomeId: "attributed",
      label: "Attack attributed",
      description:
        "Public evidence names those responsible and raises the cost of further attacks.",
      priority: 50,
      conditions: [{ axis: "attribution", min: 4 }],
      trackDeltas: { attribution: 30, intrusion: -10 },
      tensionDelta: 2,
      effectsByRole: { belligerent: damage(1) },
      wireMessage: "Governments publicly attribute a cyberattack on critical infrastructure.",
    },
    {
      outcomeId: "sanctioned",
      label: "Attackers sanctioned",
      description: "Targeted sanctions punish the groups behind the attack.",
      priority: 45,
      conditions: [{ axis: "sanctions", min: 3 }],
      trackDeltas: { attribution: 10, intrusion: -6 },
      tensionDelta: 3,
      effectsByRole: { belligerent: damage(1) },
      wireMessage: "Sanctions target the groups behind a cyberattack on critical infrastructure.",
    },
    {
      outcomeId: "attack_spreads",
      label: outage ? "Outages spread" : "Intrusion spreads",
      description: outage
        ? "Unchecked attacks knock out more of the grid and networks."
        : "Intruders move deeper into grid and network systems.",
      priority: 0,
      conditions: [],
      trackDeltas: outage ? { outage: 12 } : { intrusion: 12 },
      effectsByRole: {
        belligerent: [
          ...damage(1.5),
          cfx("flat", "approval", "government", "overall", outage ? -0.01 : -0.003, "Cyberattack"),
        ],
      },
      wireMessage: outage
        ? "Cyberattack outages spread across critical infrastructure."
        : "A cyber intrusion spreads through critical infrastructure.",
    },
  ];
}

function responseEvent(
  phase: "intrusion" | "outage",
  headline: string,
  body: string
): ConflictEvent {
  return {
    key: `${phase}_response`,
    kind: "authored",
    severity: phase === "outage" ? "critical" : "major",
    affects: ["belligerent"],
    trigger: { onPhaseEnter: true, everyTurns: 24 },
    headline,
    body,
    response: {
      windowTurns: 24,
      decisionTrees: trees(phase),
      defaultOptionIdByRole: { belligerent: "absorb" },
      outcomes: outcomes(phase),
      defaultOutcomeId: "attack_spreads",
    },
  };
}

/** Follow-up choices while systems come back; doing nothing costs nothing. */
const aftermathOutcomes: GlobalResponseOutcome[] = [
  {
    outcomeId: "rebuilt_securely",
    label: "Rebuilt securely",
    description: "Systems are rebuilt to a hardened standard, lowering the risk of a repeat.",
    priority: 50,
    conditions: [{ axis: "hardening", min: 4 }],
    trackDeltas: { hardening: 20, restoration: 10, intrusion: -10 },
    wireMessage: "Operators rebuild attacked infrastructure to a hardened standard.",
  },
  {
    outcomeId: "attackers_named",
    label: "Attackers named",
    description: "Investigators publish who carried out the campaign.",
    priority: 40,
    conditions: [{ axis: "attribution", min: 4 }],
    trackDeltas: { attribution: 20 },
    tensionDelta: 1,
    wireMessage: "Investigators name the group behind an infrastructure cyberattack.",
  },
  {
    outcomeId: "patched",
    label: "Patched and restored",
    description: "Operators restore service without wider changes.",
    priority: 0,
    conditions: [],
    wireMessage: "Attacked infrastructure is patched and restored.",
  },
];

function aftermathEvent(key: string, headline: string, body: string): ConflictEvent {
  return {
    key: `${key}_entry`,
    kind: "authored",
    severity: "major",
    affects: ["belligerent"],
    trigger: { onPhaseEnter: true },
    headline,
    body,
    response: {
      windowTurns: 24,
      decisionTrees: trees(key),
      defaultOptionIdByRole: { belligerent: "absorb" },
      outcomes: aftermathOutcomes,
      defaultOutcomeId: "patched",
    },
  };
}

export const INFRASTRUCTURE_CYBERATTACK_DEF: LivingConflictDef = {
  key: INFRASTRUCTURE_CYBERATTACK_KEY,
  type: "disaster",
  name: "Infrastructure Cyberattack",
  fromYear: 2028,
  autoOpen: true,
  minimumOpeningPressure: 1,
  participants: { belligerents: [], neighbors: [], blocMembers: [], bystanders: [] },
  roleResolver: defaultRoleResolver,
  tracks: {
    intrusion: { initial: 35 },
    outage: { initial: 0 },
    hardening: { initial: 0 },
    attribution: { initial: 10 },
    restoration: { initial: 0 },
    waveSignal: { initial: 0, max: 1000 },
    recoveryTurns: { initial: 0, max: 500 },
  },
  scheduledPressures: [
    {
      key: "intrusion_spreads",
      everyTurns: 3,
      phaseKeys: ["intrusion"],
      trackDeltas: { intrusion: 2 },
    },
    {
      // Guaranteed resolution: crews restore systems even with no policy.
      key: "outage_and_repair",
      everyTurns: 2,
      phaseKeys: ["outage"],
      trackDeltas: { outage: 3, restoration: 2 },
    },
    {
      key: "restoration_progress",
      phaseKeys: ["restoration"],
      trackDeltas: { outage: -2, restoration: 1, intrusion: -1 },
    },
    { key: "wave_active", phaseKeys: ACTIVE, trackDeltas: { recoveryTurns: -1000 } },
    {
      key: "wave_rests",
      phaseKeys: ["restored"],
      trackDeltas: {
        recoveryTurns: 1,
        intrusion: -1,
        hardening: -1,
        attribution: -1,
        restoration: -1,
        outage: -1,
      },
    },
  ],
  transitions: [
    {
      key: "intrusion_contained",
      fromPhase: "intrusion",
      toPhase: "restoration",
      priority: 90,
      conditions: [{ track: "hardening", min: 50 }],
    },
    {
      key: "outages_begin",
      fromPhase: "intrusion",
      toPhase: "outage",
      priority: 60,
      conditions: [{ track: "intrusion", min: 60 }],
    },
    {
      key: "repairs_take_hold",
      fromPhase: "outage",
      toPhase: "restoration",
      priority: 50,
      conditions: [{ track: "restoration", min: 40 }],
    },
    {
      key: "reinfection",
      fromPhase: "restoration",
      toPhase: "outage",
      priority: 60,
      conditions: [{ track: "intrusion", min: 75 }],
    },
    {
      key: "systems_restored",
      fromPhase: "restoration",
      toPhase: "restored",
      toStatus: "settled",
      priority: 40,
      conditions: [
        { track: "outage", max: 10 },
        { track: "restoration", min: 60 },
      ],
    },
    {
      key: "new_campaign",
      fromPhase: "restored",
      toPhase: "intrusion",
      toStatus: "active",
      priority: 100,
      conditions: [
        { track: "recoveryTurns", min: 96 },
        { track: "waveSignal", min: 1 },
      ],
    },
  ],
  phases: [
    {
      level: 1,
      key: "intrusion",
      label: "Intrusion",
      summary: "Attackers have broken into grid and network control systems.",
      advancePressure: 100,
      decisionTrees: trees("intrusion"),
      events: [
        responseEvent(
          "intrusion",
          "Intruders found inside critical infrastructure",
          "Security agencies have found state-backed intruders inside power grid and network control systems."
        ),
      ],
    },
    {
      level: 2,
      key: "outage",
      label: "Outages",
      summary: "Attacks are knocking out power and networks, halting businesses.",
      advancePressure: 100,
      decisionTrees: trees("outage"),
      events: [
        responseEvent(
          "outage",
          "Cyberattack blacks out power and networks",
          "Rolling outages have hit homes, hospitals and factories. Output is falling while systems are down."
        ),
      ],
    },
    {
      level: 3,
      key: "restoration",
      label: "Restoration",
      summary: "Crews are rebuilding and securing the damaged systems.",
      advancePressure: 100,
      decisionTrees: trees("restoration"),
      events: [
        aftermathEvent(
          "restoration",
          "Repair crews restore attacked systems",
          "Power and networks are coming back as damaged systems are rebuilt and secured."
        ),
      ],
    },
    {
      level: 4,
      key: "restored",
      label: "Restored",
      summary: "Systems are back and the attack campaign has ended, for now.",
      advancePressure: 100,
      decisionTrees: trees("restored"),
      events: [
        aftermathEvent(
          "restored",
          "Critical infrastructure fully restored after cyberattack",
          "Grid and network operators report normal service. Investigators are still tracing the attackers."
        ),
      ],
    },
  ],
};
