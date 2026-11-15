/**
 * Pacific strait crisis. A confrontation over a Pacific strait between China
 * and the United States climbs a ladder from posturing to an armed standoff.
 * Every rung has an off-ramp into talks, exhaustion forces talks if nobody
 * takes one, and talks always end in a managed peace. The crisis never
 * declares war: any war has to be declared through the ordinary war commands.
 * Opening needs both powers present, world tension above the threshold and a
 * seeded roll (`rules/futureConflicts.ts`).
 */
import type { CrisisEffect, GlobalResponseOutcome } from "@/lib/db/types/crisis";
import { choiceNode, responseOpt } from "../authoring";
import { cfx } from "../effects";
import { defaultRoleResolver } from "../roles";
import { PACIFIC_STRAIT_KEY } from "../rules/futureConflicts";
import type {
  ConflictEvent,
  ConflictTransition,
  LivingConflictDef,
  RoleDecisionTrees,
} from "../types";

const LADDER = ["posturing", "exclusion_zone", "quarantine", "standoff"];
const ACTIVE = [...LADDER, "talks"];
const WAR_NOTE =
  "No government is forced into war; a war can only begin through a formal declaration.";

/** Shipping and fab disruption cuts electronics output, which lifts its price. */
function electronicsShock(points: number, label: string): CrisisEffect {
  return {
    effectType: "flat",
    targetType: "profitMargin",
    metricCategory: null,
    metricField: null,
    value: -points,
    sectorType: "technology",
    strategyId: null,
    label,
    physicality: "physical",
  };
}

function defer() {
  return responseOpt(
    "defer_response",
    "Take no new action",
    "Keep current forces and trade rules unchanged.",
    {}
  );
}

function trees(key: string): RoleDecisionTrees {
  return {
    belligerent: choiceNode(
      `${key}_claimant`,
      "The strait confrontation",
      "Beijing can press its claim, offer trade terms, or open talks.",
      [
        responseOpt(
          "assert_claim",
          "Press the claim",
          "Expand patrols and exercises around the strait.",
          { escalation: 4 },
          [],
          0.002
        ),
        responseOpt("open_talks", "Open crisis talks", "Propose a hotline and direct talks.", {
          talks: 4,
        }),
        responseOpt(
          "trade_offer",
          "Offer trade terms",
          "Trade market access for a pause in deployments.",
          { concession: 4, talks: 1 }
        ),
        defer(),
      ]
    ),
    backer_a: choiceNode(
      `${key}_guarantor`,
      "A security guarantee is tested",
      "Washington can raise deterrence, open talks, make trade concessions or impose chip sanctions.",
      [
        responseOpt(
          "deterrence_patrols",
          "Fund deterrence patrols",
          "Surge naval and air patrols and raise deterrence spending.",
          { deterrence: 4, escalation: 1 },
          [],
          0.003
        ),
        responseOpt("open_talks", "Open crisis talks", "Accept direct talks and a hotline.", {
          talks: 4,
        }),
        responseOpt(
          "trade_concessions",
          "Offer trade concessions",
          "Ease tariffs and export rules in exchange for de-escalation.",
          { concession: 4 }
        ),
        responseOpt(
          "chip_sanctions",
          "Impose chip sanctions",
          "Block electronics and chip trade with the claimant.",
          { sanctions: 4, escalation: 1 }
        ),
        defer(),
      ]
    ),
    neighbor: choiceNode(
      `${key}_neighbor`,
      "A crisis on the doorstep",
      "Regional governments host forces, mediate or join sanctions.",
      [
        responseOpt(
          "host_forces",
          "Host allied forces",
          "Open bases and ports to allied patrols.",
          { deterrence: 3 },
          [],
          0.001
        ),
        responseOpt("mediate", "Offer mediation", "Host talks between the powers.", { talks: 3 }),
        responseOpt(
          "join_sanctions",
          "Join sanctions",
          "Restrict electronics trade with the claimant.",
          { sanctions: 2 }
        ),
        defer(),
      ]
    ),
    bloc: choiceNode(
      `${key}_bloc`,
      "Allies weigh their commitment",
      "Allied governments can send ships, join sanctions or press for talks.",
      [
        responseOpt(
          "naval_presence",
          "Send a naval presence",
          "Join allied patrols in the region.",
          { deterrence: 2 },
          [],
          0.001
        ),
        responseOpt(
          "join_sanctions",
          "Join sanctions",
          "Restrict electronics trade with the claimant.",
          { sanctions: 2 }
        ),
        responseOpt("back_talks", "Back talks", "Support a negotiated settlement.", { talks: 2 }),
        defer(),
      ]
    ),
    bystander: choiceNode(
      `${key}_world`,
      "Shipping lanes at risk",
      "Other governments can call for talks or stay neutral.",
      [
        responseOpt("call_for_talks", "Call for talks", "Urge both sides to negotiate.", {
          talks: 1,
        }),
        defer(),
      ]
    ),
  };
}

function outcomes(scale: number): GlobalResponseOutcome[] {
  return [
    {
      outcomeId: "talks_open",
      label: "Talks open",
      description: "Enough governments back talks to open a channel between the powers.",
      priority: 70,
      conditions: [{ axis: "talks", min: 6 }],
      trackDeltas: { talks: 25, brinkmanship: -12 },
      tensionDelta: -4,
      wireMessage: "Crisis talks open over the Pacific strait.",
    },
    {
      outcomeId: "trade_bargain",
      label: "Trade bargain",
      description: "Trade concessions buy a pause in deployments.",
      priority: 65,
      conditions: [{ axis: "concession", min: 4 }],
      trackDeltas: { talks: 15, brinkmanship: -8, tradeShock: -10 },
      tensionDelta: -2,
      effectsByRole: {
        backer_a: [cfx("flat", "approval", "government", "overall", -0.005, "Trade concessions")],
      },
      wireMessage: "A trade bargain pauses deployments around the Pacific strait.",
    },
    {
      outcomeId: "deterrence_holds",
      label: "Deterrence holds",
      description: "Allied patrols make further pressure costly without closing the strait.",
      priority: 50,
      conditions: [{ axis: "deterrence", min: 6 }],
      trackDeltas: { deterrence: 12, brinkmanship: -6 },
      tensionDelta: 2,
      wireMessage: "Allied patrols hold the line in the Pacific strait.",
    },
    {
      outcomeId: "sanctions_imposed",
      label: "Chip sanctions",
      description: "Sanctioning governments cut electronics trade with the claimant.",
      priority: 45,
      conditions: [{ axis: "sanctions", min: 5 }],
      trackDeltas: { tradeShock: 15, brinkmanship: 4 },
      tensionDelta: 3,
      tradeSanction: {
        participationAxis: "sanctions",
        targetRole: "belligerent",
        commodity: "electronics",
        durationTurns: 48,
      },
      effectsByRole: {
        belligerent: [electronicsShock(3 * scale, "Chip sanctions")],
        backer_a: [electronicsShock(1 * scale, "Chip supply disruption")],
        neighbor: [electronicsShock(1 * scale, "Chip supply disruption")],
      },
      wireMessage: "Chip sanctions cut electronics trade across the Pacific.",
    },
    {
      outcomeId: "escalation",
      label: "Escalation",
      description: "Shows of force push the confrontation up the ladder.",
      priority: 40,
      conditions: [{ axis: "escalation", min: 5 }],
      trackDeltas: { brinkmanship: 15, tradeShock: 10 },
      tensionDelta: 6,
      effectsByRole: {
        belligerent: [electronicsShock(2 * scale, "Strait shipping disruption")],
        backer_a: [electronicsShock(2 * scale, "Strait shipping disruption")],
        neighbor: [
          electronicsShock(2 * scale, "Strait shipping disruption"),
          cfx("flat", "metric", "economy", "inflation", 0.002 * scale, "Shipping costs"),
        ],
        bloc: [electronicsShock(1 * scale, "Strait shipping disruption")],
      },
      wireMessage: "Shows of force escalate the Pacific strait crisis.",
    },
    {
      outcomeId: "drift",
      label: "Drift",
      description: "No one takes the off-ramp, and the confrontation creeps upward.",
      priority: 0,
      conditions: [],
      trackDeltas: { brinkmanship: 5, tradeShock: 3 },
      tensionDelta: 1,
      effectsByRole: {
        neighbor: [electronicsShock(1 * scale, "Strait shipping risk")],
      },
      wireMessage: "The Pacific strait confrontation drifts without talks.",
    },
  ];
}

/** Follow-up choices after a settlement; doing nothing costs nothing. */
const aftermathOutcomes: GlobalResponseOutcome[] = [
  {
    outcomeId: "confidence_building",
    label: "Confidence building",
    description: "Hotlines and notification rules make the next confrontation slower to start.",
    priority: 50,
    conditions: [{ axis: "talks", min: 6 }],
    trackDeltas: { brinkmanship: -10, talks: 10 },
    tensionDelta: -3,
    wireMessage: "The powers agree confidence-building measures for the Pacific strait.",
  },
  {
    outcomeId: "armed_peace",
    label: "Armed peace",
    description: "Allies keep forces in place to deter a renewed crisis.",
    priority: 40,
    conditions: [{ axis: "deterrence", min: 6 }],
    trackDeltas: { deterrence: 10 },
    tensionDelta: 1,
    wireMessage: "Allied forces stay in the Pacific to guard the managed peace.",
  },
  {
    outcomeId: "quiet_peace",
    label: "Quiet peace",
    description: "The deal holds without new commitments.",
    priority: 0,
    conditions: [],
    wireMessage: "The Pacific strait deal holds without new commitments.",
  },
];

function responseEvent(
  phase: string,
  scale: number,
  headline: string,
  body: string
): ConflictEvent {
  return {
    key: `${phase}_response`,
    kind: "authored",
    severity: scale >= 3 ? "critical" : "major",
    affects: "all",
    trigger: { onPhaseEnter: true, everyTurns: 24 },
    headline,
    body: `${body} ${WAR_NOTE}`,
    response: {
      windowTurns: 24,
      decisionTrees: trees(phase),
      defaultOptionIdByRole: {
        belligerent: "defer_response",
        backer_a: "defer_response",
        neighbor: "defer_response",
        bloc: "defer_response",
        bystander: "defer_response",
      },
      outcomes: outcomes(scale),
      defaultOutcomeId: "drift",
    },
  };
}

const offRamps: ConflictTransition[] = LADDER.flatMap((fromPhase) => [
  {
    key: `talks_from_${fromPhase}`,
    fromPhase,
    toPhase: "talks",
    toStatus: "negotiating" as const,
    priority: 90,
    conditions: [{ track: "talks", min: 50 }],
  },
  {
    // Guaranteed resolution: exhaustion forces talks if nobody chooses them.
    key: `exhaustion_from_${fromPhase}`,
    fromPhase,
    toPhase: "talks",
    toStatus: "negotiating" as const,
    priority: 85,
    conditions: [{ track: "exhaustion", min: 80 }],
  },
]);

export const PACIFIC_STRAIT_DEF: LivingConflictDef = {
  key: PACIFIC_STRAIT_KEY,
  type: "geopolitical",
  name: "Pacific Strait Crisis",
  fromYear: 2028,
  untilYear: 2045,
  autoOpen: true,
  minimumOpeningPressure: 1,
  severeRoles: ["belligerent", "backer_a"],
  hostCountry: "CN",
  participants: {
    belligerents: ["CN"],
    backerA: "US",
    neighbors: ["JP", "KR", "PH", "AU", "VN", "IN"],
    blocMembers: ["UK", "FR", "DE", "IT", "CA"],
    bystanders: ["BR", "NG", "IE", "SE", "TR", "PL", "ES", "RU"],
  },
  roleResolver: defaultRoleResolver,
  tracks: {
    brinkmanship: { initial: 20 },
    talks: { initial: 10 },
    deterrence: { initial: 30 },
    tradeShock: { initial: 0 },
    exhaustion: { initial: 0 },
    worldTension: { initial: 0 },
    waveSignal: { initial: 0, max: 1000 },
    recoveryTurns: { initial: 0, max: 500 },
  },
  scheduledPressures: [
    {
      key: "brinkmanship_drift",
      everyTurns: 4,
      phaseKeys: ["posturing", "exclusion_zone", "quarantine"],
      trackDeltas: { brinkmanship: 2 },
    },
    {
      key: "quarantine_shipping",
      everyTurns: 4,
      phaseKeys: ["quarantine", "standoff"],
      trackDeltas: { tradeShock: 3 },
    },
    {
      key: "standoff_alarm",
      everyTurns: 4,
      phaseKeys: ["standoff"],
      trackDeltas: { talks: 2 },
    },
    { key: "diplomatic_drift", everyTurns: 6, phaseKeys: LADDER, trackDeltas: { talks: 1 } },
    { key: "exhaustion", everyTurns: 2, phaseKeys: ACTIVE, trackDeltas: { exhaustion: 1 } },
    {
      key: "talks_progress",
      everyTurns: 2,
      phaseKeys: ["talks"],
      trackDeltas: { talks: 1, brinkmanship: -1, tradeShock: -1 },
    },
    { key: "wave_active", phaseKeys: ACTIVE, trackDeltas: { recoveryTurns: -1000 } },
    {
      key: "wave_rests",
      phaseKeys: ["managed_peace"],
      trackDeltas: {
        recoveryTurns: 1,
        exhaustion: -1,
        brinkmanship: -1,
        tradeShock: -1,
        talks: -1,
      },
    },
  ],
  transitions: [
    ...offRamps,
    {
      key: "exclusion_zone_declared",
      fromPhase: "posturing",
      toPhase: "exclusion_zone",
      priority: 60,
      conditions: [
        { track: "brinkmanship", min: 40 },
        { track: "worldTension", min: 45 },
      ],
    },
    {
      key: "quarantine_imposed",
      fromPhase: "exclusion_zone",
      toPhase: "quarantine",
      priority: 60,
      conditions: [
        { track: "brinkmanship", min: 60 },
        { track: "worldTension", min: 55 },
      ],
    },
    {
      key: "armed_standoff",
      fromPhase: "quarantine",
      toPhase: "standoff",
      priority: 60,
      conditions: [
        { track: "brinkmanship", min: 80 },
        { track: "worldTension", min: 65 },
      ],
    },
    {
      key: "exclusion_zone_lifted",
      fromPhase: "exclusion_zone",
      toPhase: "posturing",
      priority: 50,
      conditions: [{ track: "brinkmanship", max: 25 }],
    },
    {
      key: "quarantine_eased",
      fromPhase: "quarantine",
      toPhase: "exclusion_zone",
      priority: 50,
      conditions: [{ track: "brinkmanship", max: 45 }],
    },
    {
      key: "standoff_eased",
      fromPhase: "standoff",
      toPhase: "quarantine",
      priority: 50,
      conditions: [{ track: "brinkmanship", max: 65 }],
    },
    {
      key: "settlement",
      fromPhase: "talks",
      toPhase: "managed_peace",
      toStatus: "settled",
      priority: 80,
      conditions: [{ track: "talks", min: 75 }],
    },
    {
      key: "exhausted_settlement",
      fromPhase: "talks",
      toPhase: "managed_peace",
      toStatus: "settled",
      priority: 70,
      conditions: [{ track: "exhaustion", min: 100 }],
    },
    {
      key: "talks_collapse",
      fromPhase: "talks",
      toPhase: "exclusion_zone",
      toStatus: "active",
      priority: 60,
      conditions: [
        { track: "brinkmanship", min: 70 },
        { track: "talks", max: 40 },
      ],
    },
    {
      key: "renewed_crisis",
      fromPhase: "managed_peace",
      toPhase: "posturing",
      toStatus: "active",
      priority: 100,
      latestYear: 2045,
      conditions: [
        { track: "recoveryTurns", min: 96 },
        { track: "waveSignal", min: 1 },
      ],
    },
  ],
  phases: [
    {
      level: 1,
      key: "posturing",
      label: "Military posturing",
      summary: "Patrols, flights and exercises press on the strait.",
      advancePressure: 100,
      defcon: 4,
      decisionTrees: trees("posturing"),
      events: [
        responseEvent(
          "posturing",
          1,
          "Military pressure builds around a Pacific strait",
          "Warships and aircraft are crowding the strait, and shipping insurers are raising rates."
        ),
      ],
    },
    {
      level: 2,
      key: "exclusion_zone",
      label: "Exclusion zone",
      summary: "Live-fire exercises close sea lanes for days at a time.",
      advancePressure: 100,
      defcon: 3,
      decisionTrees: trees("exclusion_zone"),
      events: [
        responseEvent(
          "exclusion_zone",
          2,
          "Exclusion zones close Pacific shipping lanes",
          "Declared exercise zones are forcing container ships to reroute, delaying chip and electronics shipments."
        ),
      ],
    },
    {
      level: 3,
      key: "quarantine",
      label: "Shipping quarantine",
      summary: "Ships bound for the strait are stopped and inspected.",
      advancePressure: 100,
      defcon: 3,
      decisionTrees: trees("quarantine"),
      events: [
        responseEvent(
          "quarantine",
          3,
          "A shipping quarantine chokes the Pacific strait",
          "Inspections have halted much of the trade through the strait. Electronics prices are climbing worldwide."
        ),
      ],
    },
    {
      level: 4,
      key: "standoff",
      label: "Armed standoff",
      summary: "Opposing fleets face each other at close range.",
      advancePressure: 100,
      defcon: 2,
      decisionTrees: trees("standoff"),
      events: [
        responseEvent(
          "standoff",
          4,
          "Fleets face off in the Pacific strait",
          "One mistake could start a war. Talks remain open to every government."
        ),
      ],
    },
    {
      level: 5,
      key: "talks",
      label: "Crisis talks",
      summary: "The powers negotiate under pressure from allies and markets.",
      advancePressure: 100,
      defcon: 4,
      decisionTrees: trees("talks"),
      events: [
        responseEvent(
          "talks",
          1,
          "Crisis talks open over the Pacific strait",
          "Negotiators are working on a deconfliction deal. Continued pressure could still break the talks."
        ),
      ],
    },
    {
      level: 6,
      key: "managed_peace",
      label: "Managed peace",
      summary: "A deconfliction deal reopens the strait while the dispute itself stays unresolved.",
      advancePressure: 100,
      defcon: 5,
      decisionTrees: trees("managed_peace"),
      events: [
        {
          key: "managed_peace_entry",
          kind: "authored",
          severity: "major",
          affects: "all",
          trigger: { onPhaseEnter: true },
          headline: "A deconfliction deal reopens the Pacific strait",
          body: "Shipping is moving again under a managed peace. The underlying dispute remains, and governments can build confidence or keep their guard up.",
          response: {
            windowTurns: 24,
            decisionTrees: trees("managed_peace"),
            defaultOptionIdByRole: {
              belligerent: "defer_response",
              backer_a: "defer_response",
              neighbor: "defer_response",
              bloc: "defer_response",
              bystander: "defer_response",
            },
            outcomes: aftermathOutcomes,
            defaultOutcomeId: "quiet_peace",
          },
        },
      ],
    },
  ],
};
