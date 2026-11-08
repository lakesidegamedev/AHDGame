/**
 * Builds a living-conflict definition from authored text plus the numbers in
 * `rules/waveFamilyTables.ts`. Every family shares one shape: onset, peak,
 * recovery, then a rested phase, with three levers that each answer a
 * different part of the problem. A wave resolves on its own even if nobody
 * acts, and it can only open where its gates hold.
 */
import type { CrisisEffect, GlobalResponseOutcome } from "@/lib/db/types/crisis";
import { choiceNode, responseOpt } from "../authoring";
import { cfx } from "../effects";
import { defaultRoleResolver } from "../roles";
import { waveFamilyTable, type WaveDynamics } from "../rules/waveFamilyTables";
import type { ConflictEvent, ConflictPhase, LivingConflictDef, RoleDecisionTrees } from "../types";

/** The only metrics a wave may move, so a typo cannot silently do nothing. */
const ALLOWED_METRICS = new Set([
  "economy.gdpGrowth",
  "economy.consumerConfidence",
  "economy.inflation",
  "economic.unemploymentRate",
  "economic.wageGrowth",
  "society.publicHealth",
  "society.democraticHealth",
  "social.socialCohesion",
  "infrastructure.powerGridReliability",
]);

export interface WaveEffectSpec {
  category: string;
  field: string;
  /** Swing at scale 1, as a fraction (-0.02 is a 2% swing). */
  swing: number;
  label: string;
}

export interface WaveLeverText {
  id: string;
  label: string;
  description: string;
  /** Treasury cost as a share of GDP. */
  costPctGdp: number;
}

export interface WavePhaseText {
  label: string;
  summary: string;
  headline: string;
  body: string;
}

export interface WaveFamilyContent {
  key: string;
  name: string;
  phases: {
    onset: WavePhaseText;
    peak: WavePhaseText;
    recovery: WavePhaseText;
    rested: WavePhaseText;
  };
  decision: { title: string; description: string };
  /** Contain the cause, soften the damage, adapt to the new normal. */
  levers: { contain: WaveLeverText; soften: WaveLeverText; adapt: WaveLeverText };
  doNothing: { id: string; label: string; description: string };
  outcomes: {
    contained: { label: string; description: string; wire: string };
    softened: { label: string; description: string; wire: string };
    adapted: { label: string; description: string; wire: string };
    unchecked: { onsetWire: string; peakWire: string; description: string };
    aftermath: { label: string; description: string; wire: string };
  };
  /** What the wave does to a hit country at scale 1; benefits are positive swings. */
  effects: WaveEffectSpec[];
  /** Approval swing at scale 1 while the wave bites. */
  approvalSwing: number;
}

const ACTIVE = ["onset", "peak"];
const SCORE = 4;

function effectsAt(content: WaveFamilyContent, scale: number): CrisisEffect[] {
  const effects = content.effects.map((effect) => {
    if (!ALLOWED_METRICS.has(`${effect.category}.${effect.field}`)) {
      throw new Error(`${content.key} moves unsupported metric ${effect.category}.${effect.field}`);
    }
    return cfx("flat", "metric", effect.category, effect.field, effect.swing * scale, effect.label);
  });
  effects.push(
    cfx("flat", "approval", "government", "overall", content.approvalSwing * scale, content.name)
  );
  return effects;
}

function trees(content: WaveFamilyContent, nodeKey: string): RoleDecisionTrees {
  const { contain, soften, adapt } = content.levers;
  return {
    belligerent: choiceNode(
      `${content.key}_${nodeKey}_response`,
      content.decision.title,
      content.decision.description,
      [
        responseOpt(
          contain.id,
          contain.label,
          contain.description,
          { contain: SCORE },
          [],
          contain.costPctGdp
        ),
        responseOpt(
          soften.id,
          soften.label,
          soften.description,
          { soften: SCORE },
          [],
          soften.costPctGdp
        ),
        responseOpt(
          adapt.id,
          adapt.label,
          adapt.description,
          { adapt: SCORE },
          [],
          adapt.costPctGdp
        ),
        responseOpt(
          content.doNothing.id,
          content.doNothing.label,
          content.doNothing.description,
          {}
        ),
      ]
    ),
  };
}

function outcomes(content: WaveFamilyContent, phase: "onset" | "peak"): GlobalResponseOutcome[] {
  const { dynamics, scale } = waveFamilyTable(content.key);
  const peak = phase === "peak";
  const damage = (factor: number) => (peak ? effectsAt(content, factor) : []);
  const worse = peak ? "escalation" : "pressure";
  const text = content.outcomes;
  return [
    {
      outcomeId: "contained",
      label: text.contained.label,
      description: text.contained.description,
      priority: 60,
      conditions: [{ axis: "contain", min: SCORE }],
      trackDeltas: peak
        ? { mitigation: dynamics.containedStep, recovery: 20, escalation: -10 }
        : { mitigation: dynamics.containedStep, pressure: -15 },
      effectsByRole: { belligerent: damage(scale.contained) },
      wireMessage: text.contained.wire,
    },
    {
      outcomeId: "softened",
      label: text.softened.label,
      description: text.softened.description,
      priority: 55,
      conditions: [{ axis: "soften", min: SCORE }],
      trackDeltas: peak
        ? { mitigation: dynamics.softenedStep, escalation: -8 }
        : { mitigation: dynamics.softenedStep, pressure: -6 },
      effectsByRole: { belligerent: damage(scale.softened) },
      wireMessage: text.softened.wire,
    },
    {
      outcomeId: "adapted",
      label: text.adapted.label,
      description: text.adapted.description,
      priority: 50,
      conditions: [{ axis: "adapt", min: SCORE }],
      trackDeltas: { recovery: dynamics.adaptedStep, mitigation: dynamics.adaptedStep },
      effectsByRole: { belligerent: damage(scale.adapted) },
      wireMessage: text.adapted.wire,
    },
    {
      outcomeId: "unchecked",
      label: peak ? "Damage spreads" : "Pressure builds",
      description: text.unchecked.description,
      priority: 0,
      conditions: [],
      trackDeltas: { [worse]: dynamics.uncheckedStep },
      effectsByRole: {
        belligerent: peak
          ? damage(scale.unchecked)
          : [
              cfx(
                "flat",
                "approval",
                "government",
                "overall",
                content.approvalSwing * 0.3,
                content.name
              ),
            ],
      },
      wireMessage: peak ? text.unchecked.peakWire : text.unchecked.onsetWire,
    },
  ];
}

function aftermathOutcomes(content: WaveFamilyContent): GlobalResponseOutcome[] {
  const { dynamics } = waveFamilyTable(content.key);
  const { aftermath } = content.outcomes;
  return [
    {
      outcomeId: "locked_in",
      label: aftermath.label,
      description: aftermath.description,
      priority: 50,
      conditions: [{ axis: "contain", min: SCORE }],
      trackDeltas: { mitigation: dynamics.adaptedStep * 2, recovery: dynamics.adaptedStep },
      wireMessage: aftermath.wire,
    },
    {
      outcomeId: "carried_on",
      label: "Carried on",
      description: "Governments move on without new measures.",
      priority: 0,
      conditions: [],
      wireMessage: `${content.name} fades from the agenda.`,
    },
  ];
}

function responseEvent(
  content: WaveFamilyContent,
  phase: "onset" | "peak",
  dynamics: WaveDynamics
): ConflictEvent {
  const text = content.phases[phase];
  return {
    key: `${phase}_response`,
    kind: "authored",
    severity: phase === "peak" ? "critical" : "major",
    affects: ["belligerent"],
    trigger: { onPhaseEnter: true, everyTurns: dynamics.windowTurns },
    headline: text.headline,
    body: text.body,
    response: {
      windowTurns: dynamics.windowTurns,
      decisionTrees: trees(content, phase),
      defaultOptionIdByRole: { belligerent: content.doNothing.id },
      outcomes: outcomes(content, phase),
      defaultOutcomeId: "unchecked",
    },
  };
}

function aftermathEvent(
  content: WaveFamilyContent,
  phase: "recovery" | "rested",
  dynamics: WaveDynamics
): ConflictEvent {
  const text = content.phases[phase];
  return {
    key: `${phase}_entry`,
    kind: "authored",
    severity: "major",
    affects: ["belligerent"],
    trigger: { onPhaseEnter: true },
    headline: text.headline,
    body: text.body,
    response: {
      windowTurns: dynamics.windowTurns,
      decisionTrees: trees(content, phase),
      defaultOptionIdByRole: { belligerent: content.doNothing.id },
      outcomes: aftermathOutcomes(content),
      defaultOutcomeId: "carried_on",
    },
  };
}

function phase(
  content: WaveFamilyContent,
  level: number,
  key: "onset" | "peak" | "recovery" | "rested",
  event: ConflictEvent
): ConflictPhase {
  const text = content.phases[key];
  return {
    level,
    key,
    label: text.label,
    summary: text.summary,
    advancePressure: 100,
    decisionTrees: trees(content, key),
    events: [event],
  };
}

/** Assemble the full definition. Throws when the family's table is incomplete. */
export function buildWaveFamilyDef(content: WaveFamilyContent): LivingConflictDef {
  const table = waveFamilyTable(content.key);
  const d = table.dynamics;
  const decay = -d.restDecay;
  return {
    key: content.key,
    type: "disaster",
    name: content.name,
    fromYear: table.fromYear,
    ...(table.untilYear !== undefined ? { untilYear: table.untilYear } : {}),
    autoOpen: true,
    minimumOpeningPressure: 1,
    participants: { belligerents: [], neighbors: [], blocMembers: [], bystanders: [] },
    roleResolver: defaultRoleResolver,
    tracks: {
      pressure: { initial: d.startPressure },
      escalation: { initial: 0 },
      mitigation: { initial: 0 },
      recovery: { initial: 0 },
      waveSignal: { initial: 0, max: 1000 },
      recoveryTurns: { initial: 0, max: 500 },
    },
    scheduledPressures: [
      {
        key: "pressure_builds",
        everyTurns: d.onsetEveryTurns,
        phaseKeys: ["onset"],
        trackDeltas: { pressure: d.onsetStep },
      },
      {
        // Guaranteed resolution: every wave burns out even with no policy.
        key: "peak_runs_its_course",
        everyTurns: d.peakEveryTurns,
        phaseKeys: ["peak"],
        trackDeltas: { escalation: d.peakStep, recovery: d.repairStep },
      },
      {
        key: "recovery_progress",
        phaseKeys: ["recovery"],
        trackDeltas: { escalation: -2, recovery: 1, pressure: -1 },
      },
      { key: "wave_active", phaseKeys: ACTIVE, trackDeltas: { recoveryTurns: -1000 } },
      {
        key: "wave_rests",
        phaseKeys: ["rested"],
        trackDeltas: {
          recoveryTurns: 1,
          pressure: decay,
          escalation: decay,
          mitigation: decay,
          recovery: decay,
        },
      },
    ],
    transitions: [
      {
        key: "contained_early",
        fromPhase: "onset",
        toPhase: "recovery",
        priority: 90,
        conditions: [{ track: "mitigation", min: d.containAt }],
      },
      {
        key: "peak_begins",
        fromPhase: "onset",
        toPhase: "peak",
        priority: 60,
        conditions: [{ track: "pressure", min: d.peakAt }],
      },
      {
        key: "recovery_takes_hold",
        fromPhase: "peak",
        toPhase: "recovery",
        priority: 50,
        conditions: [{ track: "recovery", min: d.recoverAt }],
      },
      {
        key: "relapse",
        fromPhase: "recovery",
        toPhase: "peak",
        priority: 60,
        conditions: [{ track: "pressure", min: d.relapseAt }],
      },
      {
        key: "settled",
        fromPhase: "recovery",
        toPhase: "rested",
        toStatus: "settled",
        priority: 40,
        conditions: [
          { track: "escalation", max: d.settledEscalationMax },
          { track: "recovery", min: d.settleAt },
        ],
      },
      {
        key: "new_wave",
        fromPhase: "rested",
        toPhase: "onset",
        toStatus: "active",
        priority: 100,
        conditions: [
          { track: "recoveryTurns", min: 96 },
          { track: "waveSignal", min: 1 },
        ],
      },
    ],
    phases: [
      phase(content, 1, "onset", responseEvent(content, "onset", d)),
      phase(content, 2, "peak", responseEvent(content, "peak", d)),
      phase(content, 3, "recovery", aftermathEvent(content, "recovery", d)),
      phase(content, 4, "rested", aftermathEvent(content, "rested", d)),
    ],
  };
}
