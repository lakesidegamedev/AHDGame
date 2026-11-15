import type { CrisisDefinition } from "./types";

/** A small definition exercising every part of the contract. */
export function makeDefinition(overrides: Partial<CrisisDefinition> = {}): CrisisDefinition {
  return {
    id: "test-crisis",
    source: "emergent",
    scope: "national",
    label: "Test crisis",
    stages: {
      signal: { minTurns: 1, maxTurns: 4 },
      onset: { minTurns: 2, maxTurns: 6 },
      peak: { minTurns: 2, maxTurns: 10 },
      aftermath: { minTurns: 2, maxTurns: 8 },
    },
    thresholds: { onset: 30, peak: 60, easing: 45, resolve: 15, surge: 85 },
    maxRelapses: 1,
    severity: {
      initial: 20,
      drivers: [
        { id: "unemployment", input: "unemployment", coefficient: 10 },
        { id: "relief", input: "relief", coefficient: -4 },
      ],
      mitigationCap: 12,
      actingThreshold: 1,
      inaction: { graceTurns: 1, perTurn: 2, growthPerTurn: 1, maxPerTurn: 5 },
      stageDecay: { aftermath: 3 },
    },
    levers: [
      {
        id: "stimulus",
        role: "headOfState",
        label: "Stimulus",
        mitigation: 6,
        cost: { treasuryCash: 1000, approval: { group: "fiscalHawks", points: 2 } },
        cooldownTurns: 2,
      },
      {
        id: "rate-cut",
        role: "centralBankChair",
        label: "Rate cut",
        mitigation: 8,
        cost: { politicalCapital: 5 },
      },
      {
        id: "relief-bill",
        role: "legislature",
        label: "Emergency relief bill",
        mitigation: 10,
        cost: { treasuryCash: 2500 },
        stages: ["onset", "peak"],
      },
    ],
    effectModules: [{ moduleId: "legacy" }],
    spillover: [],
    scarRules: [],
    forcedEvents: [],
    ...overrides,
  };
}
