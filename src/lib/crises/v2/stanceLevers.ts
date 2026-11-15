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
  /** Which kind of government reaches for it when an NPP picks a stance. */
  lean: "interventionist" | "restrained";
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
      mitigation: 0,
      cost: { politicalCapital: 5, treasuryCash: 3_000_000_000 },
      cooldownTurns: 12,
      stages: ["onset", "peak"],
    },
    lean: "interventionist",
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
      mitigation: 0,
      cost: { politicalCapital: 2 },
      cooldownTurns: 12,
      stages: ["onset", "peak"],
    },
    lean: "restrained",
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
      mitigation: 0,
      cost: { treasuryCash: 2_000_000_000 },
      cooldownTurns: 8,
    },
    lean: "interventionist",
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
      mitigation: 0,
      cost: { politicalCapital: 4 },
      cooldownTurns: 6,
    },
    lean: "interventionist",
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
      mitigation: 0,
      cost: { politicalCapital: 3, treasuryCash: 5_000_000_000 },
      cooldownTurns: 12,
      stages: ["onset", "peak"],
    },
    lean: "interventionist",
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
      mitigation: 0,
      cost: { politicalCapital: 6, treasuryCash: 2_000_000_000 },
      cooldownTurns: 12,
      stages: ["onset", "peak"],
    },
    lean: "restrained",
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
      mitigation: 0,
      cost: { treasuryCash: 3_000_000_000 },
      cooldownTurns: 8,
    },
    lean: "interventionist",
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
      mitigation: 0,
      cost: { politicalCapital: 4 },
      cooldownTurns: 6,
    },
    lean: "restrained",
    tradeoff:
      "Stops a wave of defaults on loans to automated firms and eases borrowing costs, but hides risk in the banks.",
    consequences: [{ kind: "bondYield", deltaBps: -15 }],
  },
];

export const STANCE_LEVERS: Readonly<Record<string, readonly StanceLever[]>> = {
  [SECOND_PANDEMIC_DEF_KEY]: PANDEMIC_LEVERS,
  [AI_LABOUR_SHOCK_DEF_KEY]: LABOUR_LEVERS,
};

const BY_KEY: ReadonlyMap<string, StanceLever> = new Map(
  Object.entries(STANCE_LEVERS).flatMap(([defKey, entries]) =>
    entries.map((entry) => [stanceKey(defKey, entry.lever.id), entry] as const)
  )
);

function stanceKey(defKey: string, leverId: string): string {
  return `${defKey}|${leverId}`;
}

/** Prefix a living-conflict mirror puts on its definition id (see livingConflict/rules/crisisV2). */
const CAMPAIGN_ID_PREFIX = "lc.";

/** Strips the campaign prefix from a definition id, leaving the campaign key. */
export function stanceDefKey(definitionId: string): string {
  return definitionId.startsWith(CAMPAIGN_ID_PREFIX)
    ? definitionId.slice(CAMPAIGN_ID_PREFIX.length)
    : definitionId;
}

/** Which kind of government reaches for a stance lever; undefined for any other lever. */
export function stanceLean(definitionId: string, leverId: string): StanceLever["lean"] | undefined {
  return BY_KEY.get(stanceKey(stanceDefKey(definitionId), leverId))?.lean;
}

/** The levers a living-conflict mirror offers; empty for any other campaign. */
export function stanceLeversFor(defKey: string): CrisisLeverDef[] {
  return (STANCE_LEVERS[defKey] ?? []).map((entry) => entry.lever);
}

/** Whether a lever on this definition is a stance lever (no severity effect, own package). */
export function isStanceLever(definitionId: string, leverId: string): boolean {
  return BY_KEY.has(stanceKey(stanceDefKey(definitionId), leverId));
}

/** Plain-language tradeoff for a stance lever, or undefined for any other lever. */
export function stanceTradeoff(definitionId: string, leverId: string): string | undefined {
  return BY_KEY.get(stanceKey(stanceDefKey(definitionId), leverId))?.tradeoff;
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
export function stanceIntents(
  definitionId: string,
  leverId: string,
  intensity = 1
): EffectIntent[] {
  const entry = BY_KEY.get(stanceKey(stanceDefKey(definitionId), leverId));
  const scale = clamp(intensity, 0, 1);
  if (!entry || scale <= 0) return [];
  return entry.consequences.map((intent) => scaleIntent(intent, scale));
}
