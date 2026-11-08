import { scaleCost } from "./accountability";
import {
  clamp,
  type ActiveCrisisStage,
  type CrisisDefinition,
  type CrisisLeverDef,
  type CrisisRole,
  type LeverCost,
} from "./types";

/** Roles a government run by an NPP exercises itself. */
export const NPP_EXECUTIVE_ROLES: readonly CrisisRole[] = [
  "headOfState",
  "financeMinister",
  "centralBankChair",
];

/** Approval an NPP will not spend below, so a response cannot topple its own government. */
export const NPP_APPROVAL_FLOOR = 25;
/** Share of national output an NPP will put into one crisis response in a turn. */
export const NPP_SPEND_SHARE_OF_OUTPUT = 0.015;
/** Levers a crisis can draw from an NPP government in one turn, by severity. */
export const NPP_MAX_LEVERS_BY_SEVERITY: readonly { from: number; levers: number }[] = [
  { from: 85, levers: 3 },
  { from: 60, levers: 2 },
  { from: 0, levers: 1 },
];
/** Severity at and above which an NPP always responds. */
export const NPP_ALWAYS_ACT_SEVERITY = 70;

const STAGE_URGENCY: Record<ActiveCrisisStage, number> = {
  signal: 0.4,
  onset: 0.8,
  peak: 1,
  aftermath: 0.3,
};

export interface NppResponseBudget {
  /** Spendable treasury, local currency. */
  treasuryBalance: number;
  /** National output, local currency. Absent = spend only what is in the treasury. */
  output?: number;
  /** National approval, 0..100. */
  approval: number;
}

export interface NppResponseInput {
  def: Pick<CrisisDefinition, "levers" | "thresholds">;
  stage: ActiveCrisisStage;
  severity: number;
  /** Roles the NPP government exercises, minus any a sitting player holds. */
  roles: ReadonlySet<CrisisRole>;
  /** Levers on cooldown or already pulled this turn for this crisis. */
  blockedLeverIds: ReadonlySet<string>;
  budget: NppResponseBudget;
  /** 0..1 appetite for acting early and spending; from the government's archetype. */
  interventionism: number;
  rng: () => number;
}

export interface NppLeverPick {
  lever: CrisisLeverDef;
  intensity: number;
  cost: LeverCost;
}

function maxLevers(severity: number): number {
  for (const tier of NPP_MAX_LEVERS_BY_SEVERITY) if (severity >= tier.from) return tier.levers;
  return 1;
}

function spendLimit(budget: NppResponseBudget): number {
  const funded = Math.max(0, budget.treasuryBalance);
  if (!budget.output || budget.output <= 0) return funded;
  return Math.max(funded, budget.output * NPP_SPEND_SHARE_OF_OUTPUT);
}

/** Whether an NPP government reacts to this crisis this turn. */
export function nppWillRespond(input: NppResponseInput): boolean {
  const urgency = STAGE_URGENCY[input.stage];
  const floor = 30 - 20 * clamp(input.interventionism, 0, 1);
  if (input.severity * urgency < floor) return false;
  if (input.severity >= NPP_ALWAYS_ACT_SEVERITY) return true;
  const chance = clamp(0.35 + 0.3 * input.interventionism + 0.6 * (input.severity / 100), 0, 1);
  return input.rng() < chance;
}

/**
 * Picks the levers an NPP government pulls on one crisis this turn. It leans on
 * levers that remove the most severity per unit of cost, never takes a role it
 * does not hold, never spends past what the treasury and its share of output
 * allow, never drops approval under the floor, and pulls at most one lever per
 * role. Cost components the game cannot charge an NPP (corporate cash,
 * political capital) are skipped rather than ignored.
 */
export function chooseNppLevers(input: NppResponseInput): NppLeverPick[] {
  if (!nppWillRespond(input)) return [];
  const intensity =
    Math.round(clamp(input.severity / 100 + 0.2 * input.interventionism, 0.3, 1) * 10) / 10;
  const limit = spendLimit(input.budget);
  let spendLeft = limit;
  let approvalLeft = Math.max(0, input.budget.approval - NPP_APPROVAL_FLOOR);

  const scored = input.def.levers
    .filter(
      (lever) =>
        input.roles.has(lever.role) &&
        !input.blockedLeverIds.has(lever.id) &&
        !lever.cost.corpCash &&
        (!lever.stages || lever.stages.includes(input.stage)) &&
        lever.role !== "legislature" &&
        lever.role !== "corpCeo"
    )
    .map((lever) => {
      const cost = scaleCost(lever.cost, intensity);
      const treasury = cost.treasuryCash ?? 0;
      const approval = cost.approval?.points ?? 0;
      const burden =
        (limit > 0 ? treasury / limit : treasury > 0 ? 1 : 0) +
        approval / Math.max(1, approvalLeft || 1);
      return {
        lever,
        cost,
        treasury,
        approval,
        score: (lever.mitigation * intensity) / (1 + burden),
      };
    })
    .sort((a, b) => b.score - a.score || a.lever.id.localeCompare(b.lever.id));

  const picks: NppLeverPick[] = [];
  const usedRoles = new Set<CrisisRole>();
  const cap = maxLevers(input.severity);
  for (const candidate of scored) {
    if (picks.length >= cap) break;
    if (usedRoles.has(candidate.lever.role)) continue;
    if (candidate.treasury > spendLeft) continue;
    if (candidate.approval > approvalLeft) continue;
    spendLeft -= candidate.treasury;
    approvalLeft -= candidate.approval;
    usedRoles.add(candidate.lever.role);
    picks.push({ lever: candidate.lever, intensity, cost: candidate.cost });
  }
  return picks;
}

/** Deterministic 0..1 stream from a string seed, so a replayed turn picks the same levers. */
export function seededRng(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Appetite for acting early and spending, from the head's ambition and stubbornness sliders (0..100). */
export function interventionismFromPersonality(personality: {
  ambition: number;
  stubbornness: number;
}): number {
  return clamp((personality.ambition * 0.7 + (100 - personality.stubbornness) * 0.3) / 100, 0, 1);
}
