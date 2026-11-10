/**
 * Cyber operations: one country attacking another's networks.
 *
 * Success is attacker capability against the target's cyber resilience (`rules.ts`, which
 * already folds in the resilience mandate spending, technology and utilities). Attribution
 * is a separate roll, so a clean success, a loud success and a loud failure are all possible.
 * Every escalation has an off-ramp: a standing-down declaration opens a truce that refuses
 * further operations between the pair and relieves tension.
 *
 * Pure: plain data in, plain data out. Randomness arrives as injected rolls in [0, 1).
 */

/** Operations between one attacker and one target must be this many turns apart. */
export const CYBER_COOLDOWN_TURNS = 24;
/** Turns a stand-down truce refuses further operations between the pair. */
export const CYBER_TRUCE_TURNS = 72;
/** World tension added when an operation is traced back to its sponsor. */
export const CYBER_ATTRIBUTION_TENSION = 5;
/** World tension removed when an attacker publicly stands down. */
export const CYBER_STAND_DOWN_RELIEF = 4;
/** Turns the sponsor's government takes an approval hit after being exposed. */
export const CYBER_EXPOSURE_TURNS = 4;
/** Below this world tension (detente) scripted governments mount no operations. */
export const CYBER_SCRIPTED_TENSION_FLOOR = 25;
/** Hawkishness a scripted government needs before it considers an operation. */
export const CYBER_SCRIPTED_HAWKISHNESS = 0.6;
/** Capability a scripted attacker brings; background countries model no cyber budget. */
export const SCRIPTED_CAPABILITY = 0.45;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Tradecraft range shared with the intelligence agency record. */
const TRADECRAFT_MIN = 1;
const TRADECRAFT_MAX = 10;

export type CyberOperationOutcome = "success" | "failed";

export interface CyberOperationInput {
  /** Attacker cyber score, 0..1 (`cyberResilienceScore` of the attacker). */
  attackerScore: number;
  /** Attacker agency tradecraft, 1..10. */
  tradecraft: number;
  /** Target cyber resilience, 0..1. */
  targetResilience: number;
  /** [0, 1) */
  successRoll: number;
  /** [0, 1) */
  attributionRoll: number;
}

export interface CyberOperationResolution {
  outcome: CyberOperationOutcome;
  /** The target can name the sponsor. Independent of the outcome. */
  attributed: boolean;
  /** 0..1 */
  capability: number;
  successChance: number;
  attributionChance: number;
  /** 0..1 scale of the damage a successful operation does, from the capability margin. */
  severity: number;
}

/** Attacker capability 0..1: the cyber score, sharpened by the service's tradecraft. */
export function attackerCapability(attackerScore: number, tradecraft: number): number {
  const trade = clamp01((tradecraft - TRADECRAFT_MIN) / (TRADECRAFT_MAX - TRADECRAFT_MIN));
  return clamp01(0.7 * clamp01(attackerScore) + 0.3 * trade);
}

/** Chance an operation gets through: capability against resilience, never certain either way. */
export function cyberSuccessChance(capability: number, targetResilience: number): number {
  return Math.max(
    0.05,
    Math.min(0.9, 0.45 + 0.9 * (clamp01(capability) - clamp01(targetResilience)))
  );
}

/**
 * Chance the target traces the operation to its sponsor. A resilient target has better
 * logging, a capable attacker leaves less behind, and a failed operation is noisier.
 */
export function cyberAttributionChance(
  capability: number,
  targetResilience: number,
  outcome: CyberOperationOutcome
): number {
  const base = 0.2 + 0.45 * clamp01(targetResilience) - 0.25 * clamp01(capability);
  return clamp01(base + (outcome === "failed" ? 0.2 : 0));
}

export function resolveCyberOperation(input: CyberOperationInput): CyberOperationResolution {
  const capability = attackerCapability(input.attackerScore, input.tradecraft);
  const successChance = cyberSuccessChance(capability, input.targetResilience);
  const outcome: CyberOperationOutcome = input.successRoll < successChance ? "success" : "failed";
  const attributionChance = cyberAttributionChance(capability, input.targetResilience, outcome);
  return {
    outcome,
    attributed: input.attributionRoll < attributionChance,
    capability,
    successChance,
    attributionChance,
    severity:
      outcome === "success" ? clamp01(0.4 + (capability - clamp01(input.targetResilience))) : 0,
  };
}

export interface CyberPairHistory {
  /** Turn of the latest operation by this attacker against this target, if any. */
  lastOperationTurn: number | null;
  /** Turn a stand-down truce between the pair lapses, if one was declared. */
  truceUntilTurn: number | null;
}

export type CyberRefusal = "self" | "truce" | "cooldown" | "no_resilience_data";

/** Why an operation cannot be launched now, or null when it can. */
export function cyberOperationRefusal(
  attackerId: string,
  targetId: string,
  history: CyberPairHistory,
  targetResilience: number | null,
  turn: number
): CyberRefusal | null {
  if (attackerId === targetId) return "self";
  if (targetResilience === null) return "no_resilience_data";
  if (history.truceUntilTurn !== null && history.truceUntilTurn > turn) return "truce";
  if (history.lastOperationTurn !== null && turn - history.lastOperationTurn < CYBER_COOLDOWN_TURNS)
    return "cooldown";
  return null;
}

export const CYBER_REFUSAL_TEXT: Record<CyberRefusal, string> = {
  self: "A service cannot run a cyber operation against its own country.",
  no_resilience_data: "That country has no network data to attack.",
  truce:
    "A cyber truce with that country is in force. No operation can be launched until it lapses.",
  cooldown:
    "An operation against that country was run recently. Teams need time to rebuild access.",
};

/** The truce a stand-down declaration opens, from the turn it is made. */
export function truceUntil(turn: number): number {
  return turn + CYBER_TRUCE_TURNS;
}

export interface ScriptedCyberInput {
  attackerId: string;
  /** 0 dovish to 1 hawkish. */
  hawkishness: number;
  /** The rival bloc's leader, or null for a non-aligned country. */
  rivalLeaderId: string | null;
  /** World tension, 0..100. */
  tension: number;
  history: CyberPairHistory;
  /** Resilience of the rival, or null where it has no network data. */
  targetResilience: number | null;
  turn: number;
  /** [0, 1) deterministic per country and turn. */
  decisionRoll: number;
}

export type ScriptedCyberDecision =
  | { kind: "launch"; targetId: string }
  | { kind: "stand_down"; targetId: string }
  | { kind: "none" };

/**
 * A scripted government's cyber decision. Hawks at high tension probe the rival bloc leader
 * when the odds favour them. A government that has turned dovish, or a world that has cooled
 * to detente, stands down from any pair it has an operation history with, which opens the truce.
 */
export function planScriptedCyberOperation(input: ScriptedCyberInput): ScriptedCyberDecision {
  const target = input.rivalLeaderId;
  if (!target || target === input.attackerId) return { kind: "none" };
  const recentlyActive =
    input.history.lastOperationTurn !== null &&
    input.turn - input.history.lastOperationTurn < CYBER_TRUCE_TURNS;
  const truceOpen =
    input.history.truceUntilTurn !== null && input.history.truceUntilTurn > input.turn;
  const willing =
    input.hawkishness >= CYBER_SCRIPTED_HAWKISHNESS &&
    input.tension >= CYBER_SCRIPTED_TENSION_FLOOR;
  if (!willing) {
    return recentlyActive && !truceOpen
      ? { kind: "stand_down", targetId: target }
      : { kind: "none" };
  }
  if (
    cyberOperationRefusal(
      input.attackerId,
      target,
      input.history,
      input.targetResilience,
      input.turn
    )
  )
    return { kind: "none" };
  const odds = cyberSuccessChance(SCRIPTED_CAPABILITY, input.targetResilience ?? 0);
  // Scripted governments probe only when the odds favour them, and then not every tick.
  if (odds < 0.4) return { kind: "none" };
  const appetite =
    0.02 + 0.06 * (input.hawkishness - CYBER_SCRIPTED_HAWKISHNESS) + 0.001 * input.tension;
  return input.decisionRoll < appetite ? { kind: "launch", targetId: target } : { kind: "none" };
}
