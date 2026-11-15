import {
  clamp,
  clampSeverity,
  type ActiveCrisisStage,
  type CrisisDefinition,
  type CrisisInstance,
  type CrisisLeverDef,
  type LeverUse,
} from "./types";

/** Samples kept per instance; older ones are dropped. */
export const SEVERITY_HISTORY_LIMIT = 48;

/** Stages in which doing nothing lets a crisis feed on itself. */
const ESCALATING_STAGES: ReadonlySet<ActiveCrisisStage> = new Set(["signal", "onset", "peak"]);

export interface AcceptedLeverUse {
  use: LeverUse;
  lever: CrisisLeverDef;
  /** Severity points removed after the per-turn cap is applied. */
  mitigation: number;
}

export interface SeverityStepInput {
  turn: number;
  /** Sim inputs for this turn keyed by `CrisisDriverDef.input`. Missing = 0. */
  driverInputs: Readonly<Record<string, number>>;
  leverUses: readonly LeverUse[];
}

export interface SeverityStep {
  before: number;
  after: number;
  driverTerms: Record<string, number>;
  driverTotal: number;
  mitigation: number;
  decay: number;
  escalation: number;
  idleTurns: number;
  accepted: AcceptedLeverUse[];
}

export function leverKey(leverId: string, holderId: string): string {
  return `${leverId}:${holderId}`;
}

/**
 * Lever uses that count this turn: known lever, offered in the current stage,
 * off cooldown, and only the first use of a lever by one holder.
 */
export function acceptLeverUses(
  instance: Pick<CrisisInstance, "stage" | "leverLastUsed">,
  def: CrisisDefinition,
  uses: readonly LeverUse[],
  turn: number
): AcceptedLeverUse[] {
  if (instance.stage === "resolved") return [];
  const stage = instance.stage;
  const byId = new Map(def.levers.map((lever) => [lever.id, lever]));
  const seen = new Set<string>();
  const raw: AcceptedLeverUse[] = [];

  for (const use of uses) {
    const lever = byId.get(use.leverId);
    if (!lever) continue;
    if (lever.stages && !lever.stages.includes(stage)) continue;
    const key = leverKey(use.leverId, use.holderId);
    if (seen.has(key)) continue;
    const last = instance.leverLastUsed[key];
    if (last !== undefined && turn - last <= (lever.cooldownTurns ?? 0)) continue;
    seen.add(key);
    const intensity = clamp(use.intensity ?? 1, 0, 1);
    raw.push({ use: { ...use, intensity }, lever, mitigation: lever.mitigation * intensity });
  }

  const total = raw.reduce((sum, entry) => sum + entry.mitigation, 0);
  const cap = def.severity.mitigationCap;
  if (total <= cap || total === 0) return raw;
  const scale = cap / total;
  return raw.map((entry) => ({ ...entry, mitigation: entry.mitigation * scale }));
}

/**
 * severity_next = clamp(severity + drivers - mitigation - stage decay + inaction
 * escalation). Pure; every coefficient comes from the definition.
 */
export function computeSeverityStep(
  instance: Pick<CrisisInstance, "stage" | "severity" | "idleTurns" | "leverLastUsed">,
  def: CrisisDefinition,
  input: SeverityStepInput
): SeverityStep {
  const model = def.severity;
  const driverTerms: Record<string, number> = {};
  let driverTotal = 0;
  for (const driver of model.drivers) {
    const term = driver.coefficient * (input.driverInputs[driver.input] ?? 0);
    driverTerms[driver.id] = term;
    driverTotal += term;
  }

  const accepted = acceptLeverUses(instance, def, input.leverUses, input.turn);
  const mitigation = accepted.reduce((sum, entry) => sum + entry.mitigation, 0);
  const acting = mitigation > 0 && mitigation >= model.actingThreshold;
  const idleTurns = acting ? 0 : instance.idleTurns + 1;

  let escalation = 0;
  if (instance.stage !== "resolved" && ESCALATING_STAGES.has(instance.stage)) {
    const overGrace = idleTurns - model.inaction.graceTurns;
    if (overGrace > 0) {
      escalation = Math.min(
        model.inaction.maxPerTurn,
        model.inaction.perTurn + model.inaction.growthPerTurn * (overGrace - 1)
      );
    }
  }

  const decay = instance.stage === "resolved" ? 0 : (model.stageDecay?.[instance.stage] ?? 0);
  const after = clampSeverity(instance.severity + driverTotal - mitigation - decay + escalation);

  return {
    before: instance.severity,
    after,
    driverTerms,
    driverTotal,
    mitigation,
    decay,
    escalation,
    idleTurns,
    accepted,
  };
}

/** Folds a computed step into a new instance. Does not change the stage. */
export function applySeverityStep(
  instance: CrisisInstance,
  step: SeverityStep,
  turn: number
): CrisisInstance {
  const leverLastUsed = { ...instance.leverLastUsed };
  for (const entry of step.accepted) {
    leverLastUsed[leverKey(entry.lever.id, entry.use.holderId)] = turn;
  }
  const severityHistory = [...instance.severityHistory, { turn, severity: step.after }].slice(
    -SEVERITY_HISTORY_LIMIT
  );
  return {
    ...instance,
    severity: step.after,
    peakSeverity: Math.max(instance.peakSeverity, step.after),
    severityHistory,
    idleTurns: step.idleTurns,
    leverLastUsed,
  };
}

/**
 * Severity path if nobody acts, holding driver inputs steady and the stage
 * fixed. Returns one value per forecast turn. Feeds the "if nobody acts" view.
 */
export function forecastInaction(
  instance: Pick<CrisisInstance, "stage" | "severity" | "idleTurns" | "leverLastUsed">,
  def: CrisisDefinition,
  driverInputs: Readonly<Record<string, number>>,
  turn: number,
  horizonTurns: number
): number[] {
  const path: number[] = [];
  let state = { ...instance };
  for (let i = 1; i <= horizonTurns; i++) {
    const step = computeSeverityStep(state, def, { turn: turn + i, driverInputs, leverUses: [] });
    path.push(step.after);
    state = { ...state, severity: step.after, idleTurns: step.idleTurns };
  }
  return path;
}
