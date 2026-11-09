/**
 * Stance levers for the second pandemic and the AI labour shock.
 *
 * These two families run on a living-conflict clock, so their Crisis v2 mirror
 * is paced by the conflict's own intensity and a lever cannot ease severity.
 * A stance lever is a political choice instead: pulling it pays its cost, puts
 * the holder in the accountability ledger, and sends a fixed one-off package of
 * consequences to the holder's own country (bonds, banks, jobs, approval and the
 * next election). Plain data in, plain data out.
 */
import type { EffectIntent } from "./effectModule";
import { clamp, type CrisisLeverDef } from "./types";

export const SECOND_PANDEMIC_DEF_KEY = "second_pandemic";
export const AI_LABOUR_SHOCK_DEF_KEY = "ai_labour_shock";

/** A lever plus the package it sends to the holder's country when pulled. */
export interface StanceLever {
  lever: CrisisLeverDef;
  /** Short plain-language line on the tradeoff, shown beside the button. */
  tradeoff: string;
  /** Consequences at full intensity; the shell scales them by the pull's intensity. */
  consequences: readonly EffectIntent[];
}

const PANDEMIC_LEVERS: readonly StanceLever[] = [
  {
    lever: {
      id: "lockdown",
      role: "headOfState",
      label: "Order a lockdown",
      mitigation: 6,
      cost: { politicalCapital: 5, treasuryCash: 3_000_000_000 },
      cooldownTurns: 12,
      stages: ["onset", "peak"],
    },
    tradeoff:
      "Saves lives and calms the hospitals, but shuts workplaces, lifts unemployment and strains lenders.",
    consequences: [
      { kind: "metric", category: "society", field: "publicHealth", delta: 0.02 },
      { kind: "gdpLoss", fraction: 0.004 },
      { kind: "metric", category: "economic", field: "unemploymentRate", delta: 0.004 },
      { kind: "bankStress", delta: 0.3 },
      { kind: "bondYield", deltaBps: 20 },
      { kind: "approval", delta: -0.2 },
    ],
  },
  {
    lever: {
      id: "stay-open",
      role: "headOfState",
      label: "Keep the economy open",
      mitigation: 0.5,
      cost: { politicalCapital: 2 },
      cooldownTurns: 12,
      stages: ["onset", "peak"],
    },
    tradeoff:
      "Protects jobs and lenders for now, but more people fall ill and voters remember who held back.",
    consequences: [
      { kind: "metric", category: "society", field: "publicHealth", delta: -0.02 },
      { kind: "metric", category: "economic", field: "consumerConfidence", delta: -0.01 },
      { kind: "approval", delta: 0.15 },
      { kind: "electionSwing", deltaPoints: 0.1, incumbentOnly: true },
    ],
  },
  {
    lever: {
      id: "health-bond-issue",
      role: "financeMinister",
      label: "Issue emergency health bonds",
      mitigation: 3,
      cost: { treasuryCash: 2_000_000_000 },
      cooldownTurns: 8,
    },
    tradeoff: "Pays for surge care now and pushes up what the state pays to borrow.",
    consequences: [
      { kind: "metric", category: "society", field: "publicHealth", delta: 0.01 },
      { kind: "bondYield", deltaBps: 35 },
      { kind: "approval", delta: 0.1 },
    ],
  },
  {
    lever: {
      id: "central-bank-backstop",
      role: "centralBankChair",
      label: "Backstop lenders and bond markets",
      mitigation: 2,
      cost: { politicalCapital: 4 },
      cooldownTurns: 6,
    },
    tradeoff: "Keeps credit flowing and eases borrowing costs, at the price of higher prices.",
    consequences: [
      { kind: "bondYield", deltaBps: -30 },
      { kind: "inflation", delta: 0.002 },
    ],
  },
];

const LABOUR_LEVERS: readonly StanceLever[] = [
  {
    lever: {
      id: "bail-out-sectors",
      role: "headOfState",
      label: "Bail out the hardest-hit sectors",
      mitigation: 3,
      cost: { politicalCapital: 3, treasuryCash: 5_000_000_000 },
      cooldownTurns: 12,
      stages: ["onset", "peak"],
    },
    tradeoff:
      "Protects jobs this year, but the bill raises borrowing costs and keeps the old model.",
    consequences: [
      { kind: "metric", category: "economic", field: "unemploymentRate", delta: -0.004 },
      { kind: "bondYield", deltaBps: 40 },
      { kind: "approval", delta: 0.3 },
    ],
  },
  {
    lever: {
      id: "structural-reform",
      role: "headOfState",
      label: "Push structural reform",
      mitigation: 7,
      cost: { politicalCapital: 6, treasuryCash: 2_000_000_000 },
      cooldownTurns: 12,
      stages: ["onset", "peak"],
    },
    tradeoff:
      "Retrains and rebuilds the safety net for the long run. Jobs get worse first and voters punish it.",
    consequences: [
      { kind: "metric", category: "economic", field: "unemploymentRate", delta: 0.002 },
      { kind: "bankStress", delta: 0.2 },
      { kind: "approval", delta: -0.3 },
      { kind: "electionSwing", deltaPoints: 0.15, incumbentOnly: true },
    ],
  },
  {
    lever: {
      id: "wage-subsidy-scheme",
      role: "financeMinister",
      label: "Fund a wage subsidy scheme",
      mitigation: 3,
      cost: { treasuryCash: 3_000_000_000 },
      cooldownTurns: 8,
    },
    tradeoff: "Keeps displaced workers paid and spending. Costs the budget, lifting bond yields.",
    consequences: [
      { kind: "metric", category: "economic", field: "unemploymentRate", delta: -0.002 },
      { kind: "metric", category: "economic", field: "wageGrowth", delta: 0.002 },
      { kind: "bondYield", deltaBps: 15 },
    ],
  },
  {
    lever: {
      id: "lender-forbearance",
      role: "centralBankChair",
      label: "Allow lender forbearance",
      mitigation: 2,
      cost: { politicalCapital: 4 },
      cooldownTurns: 6,
    },
    tradeoff: "Stops a wave of defaults on loans to automated firms, but hides risk in the banks.",
    consequences: [
      { kind: "bankStress", delta: 0.15 },
      { kind: "bondYield", deltaBps: -15 },
    ],
  },
];

export const STANCE_LEVERS: Readonly<Record<string, readonly StanceLever[]>> = {
  [SECOND_PANDEMIC_DEF_KEY]: PANDEMIC_LEVERS,
  [AI_LABOUR_SHOCK_DEF_KEY]: LABOUR_LEVERS,
};

const BY_LEVER_ID: ReadonlyMap<string, StanceLever> = new Map(
  Object.values(STANCE_LEVERS).flatMap((entries) =>
    entries.map((entry) => [entry.lever.id, entry] as const)
  )
);

/** The levers a living-conflict mirror offers; empty for any other campaign. */
export function stanceLeversFor(defKey: string): CrisisLeverDef[] {
  return (STANCE_LEVERS[defKey] ?? []).map((entry) => entry.lever);
}

/** Plain-language tradeoff for a stance lever, or undefined for any other lever. */
export function stanceTradeoff(leverId: string): string | undefined {
  return BY_LEVER_ID.get(leverId)?.tradeoff;
}

function scaleIntent(intent: EffectIntent, scale: number): EffectIntent {
  switch (intent.kind) {
    case "metric":
    case "inflation":
    case "approval":
    case "bankStress":
      return { ...intent, delta: intent.delta * scale };
    case "bondYield":
      return { ...intent, deltaBps: intent.deltaBps * scale };
    case "electionSwing":
      return { ...intent, deltaPoints: intent.deltaPoints * scale };
    case "gdpLoss":
      return { ...intent, fraction: intent.fraction * scale };
    default:
      return intent;
  }
}

/**
 * The consequences of one stance pull, scaled by its intensity. Empty for a
 * lever with no stance package or a zero-strength pull.
 */
export function stanceIntents(leverId: string, intensity = 1): EffectIntent[] {
  const entry = BY_LEVER_ID.get(leverId);
  const scale = clamp(intensity, 0, 1);
  if (!entry || scale <= 0) return [];
  return entry.consequences.map((intent) => scaleIntent(intent, scale));
}
