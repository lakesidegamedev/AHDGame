import type { CrisisDefinition } from "../../types";

export const regionalUnemploymentDefinition: CrisisDefinition = {
  id: "emergent-regional-unemployment",
  source: "emergent",
  scope: "state",
  label: "Regional jobs shock",
  stages: {
    signal: { minTurns: 1, maxTurns: 6 },
    onset: { minTurns: 3, maxTurns: 12 },
    peak: { minTurns: 4, maxTurns: 24 },
    aftermath: { minTurns: 4, maxTurns: 16 },
  },
  thresholds: { onset: 25, peak: 55, easing: 40, resolve: 12, surge: 85 },
  maxRelapses: 1,
  severity: {
    initial: 20,
    drivers: [
      { id: "unemployment", input: "unemploymentGap", coefficient: 0.3 },
      { id: "growth", input: "growthGap", coefficient: 0.15 },
      { id: "safety-net", input: "safetyNetGap", coefficient: -0.12 },
    ],
    mitigationCap: 6,
    actingThreshold: 1,
    inaction: { graceTurns: 3, perTurn: 0.5, growthPerTurn: 0.2, maxPerTurn: 1.8 },
    stageDecay: { aftermath: 1.2 },
  },
  levers: [
    {
      id: "regional-aid",
      role: "stateGovernor",
      label: "Regional jobs programme",
      mitigation: 2.5,
      cost: { politicalCapital: 4 },
      cooldownTurns: 4,
    },
    {
      id: "federal-assistance",
      role: "headOfState",
      label: "Federal assistance",
      mitigation: 2.5,
      cost: { treasuryCash: 1_000_000_000 },
      cooldownTurns: 6,
    },
    {
      id: "regional-relief-bill",
      role: "legislature",
      label: "Regional relief bill",
      mitigation: 3,
      cost: { treasuryCash: 1_500_000_000 },
      cooldownTurns: 10,
      stages: ["onset", "peak"],
    },
    {
      id: "keep-the-plant-open",
      role: "corpCeo",
      label: "Keep local sites open",
      mitigation: 1.5,
      cost: { corpCash: 400_000 },
      cooldownTurns: 6,
    },
  ],
  effectModules: [
    { moduleId: "rotdm.production", params: { maxCut: 0.05 } },
    { moduleId: "rotdm.migration", params: { maxFraction: 0.004 } },
    { moduleId: "rotdm.approval", params: { max: 0.15 } },
    { moduleId: "rotdm.electionSwing", params: { maxPoints: 0.15 } },
  ],
  spillover: [],
  scarRules: [
    {
      id: "hollowed-out-region",
      kind: "population",
      onStage: "aftermath",
      minPeakSeverity: 55,
      magnitudePerPoint: 0.0003,
      recoveryTurns: 72,
    },
  ],
  forcedEvents: [
    {
      id: "regional-strike",
      event: "strike",
      minSeverity: 65,
      sustainedTurns: 3,
      stages: ["peak"],
    },
  ],
};
