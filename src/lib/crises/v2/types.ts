/**
 * Crisis v2 contract: one definition shape and one live-instance shape for both
 * scripted world shocks and sim-emergent crises.
 *
 * Everything under `src/lib/crises/v2` is a portable rules zone: plain data in,
 * plain data out, no database, clock, randomness or ambient state. The turn
 * phase that will host it loads documents, calls these modules and writes the
 * results.
 */

/** Stages run left to right; `resolved` is terminal. */
export const CRISIS_STAGES = ["signal", "onset", "peak", "aftermath", "resolved"] as const;
export type CrisisStage = (typeof CRISIS_STAGES)[number];

/** Stages a crisis can spend time in, i.e. every stage but the terminal one. */
export type ActiveCrisisStage = Exclude<CrisisStage, "resolved">;

export type CrisisSource = "scripted" | "emergent";

/** How wide the crisis reaches, which is what the director budgets load by. */
export type CrisisScope = "local" | "state" | "national" | "global";

/** Offices that can hold a lever. Congress acts through an emergency bill. */
export type CrisisRole =
  | "headOfState"
  | "stateGovernor"
  | "legislature"
  | "centralBankChair"
  | "financeMinister"
  | "corpCeo"
  | "partyLeader";

/** Real resources a lever spends. Absent keys cost nothing. */
export interface LeverCost {
  treasuryCash?: number;
  politicalCapital?: number;
  corpCash?: number;
  /** Approval spent with one demographic or faction, in points (positive = lost). */
  approval?: { group: string; points: number };
}

export interface CrisisLeverDef {
  id: string;
  role: CrisisRole;
  label: string;
  /** Severity points removed per turn at full intensity. */
  mitigation: number;
  cost: LeverCost;
  /** Turns before the same holder can pull this lever again. 0 = every turn. */
  cooldownTurns?: number;
  /** Stages the lever is offered in. Absent = every active stage. */
  stages?: readonly ActiveCrisisStage[];
  /** Offered only once a state of emergency has been declared on the crisis. */
  requiresEmergency?: boolean;
}

/** One sim input feeding severity. `input` is a key the shell fills each turn. */
export interface CrisisDriverDef {
  id: string;
  input: string;
  /** Severity points added per unit of input. Negative drivers push severity down. */
  coefficient: number;
}

export interface InactionEscalation {
  /** Turns of no mitigation tolerated before escalation starts. */
  graceTurns: number;
  /** Severity points added on the first turn after the grace period. */
  perTurn: number;
  /** Extra points added per further idle turn. */
  growthPerTurn: number;
  /** Ceiling on the per-turn addition. */
  maxPerTurn: number;
}

export interface SeverityModel {
  /** Severity at the moment the crisis opens. */
  initial: number;
  drivers: readonly CrisisDriverDef[];
  /** Ceiling on total mitigation in one turn, so stacking levers has limits. */
  mitigationCap: number;
  /** Mitigation below this does not count as acting, so token moves do not reset escalation. */
  actingThreshold: number;
  inaction: InactionEscalation;
  /** Severity shed per turn by stage even with no lever, e.g. an aftermath fading. */
  stageDecay?: Partial<Record<ActiveCrisisStage, number>>;
}

export interface StageRule {
  minTurns: number;
  /** Turns after which the crisis moves on regardless. Null = severity decides. */
  maxTurns: number | null;
}

/** Severity thresholds, all on the 0..100 scale. */
export interface StageThresholds {
  /** Signal becomes onset at or above this. */
  onset: number;
  /** Onset becomes peak at or above this. */
  peak: number;
  /** Peak becomes aftermath at or below this. */
  easing: number;
  /** At or below this the crisis counts as contained. */
  resolve: number;
  /** At or above this, upward transitions ignore the stage minimum. */
  surge?: number;
}

export interface EffectModuleRef {
  moduleId: string;
  params?: Record<string, number | string | boolean>;
}

export type SpilloverChannel = "trade" | "finance" | "alliance" | "migration" | "climate";

export interface SpilloverLink {
  id: string;
  channel: SpilloverChannel;
  /** Definition opened (or fed) in the linked jurisdiction. */
  targetDefinitionId: string;
  /** Source severity needed before anything spills. */
  minSeverity: number;
  /** Stage the source must have reached. Absent = any active stage. */
  minStage?: ActiveCrisisStage;
  /** Share of source severity passed on, 0..1. */
  transmission: number;
  delayTurns?: number;
}

export type ScarKind =
  "regionalOutput" | "plantCapacity" | "institutionalTrust" | "population" | "creditStanding";

export interface ScarRule {
  id: string;
  kind: ScarKind;
  /** Scar is laid down when the crisis enters this stage. */
  onStage: ActiveCrisisStage | "resolved";
  /** Peak severity the crisis must have reached for the scar to form. */
  minPeakSeverity: number;
  /**
   * Scar size per severity point above `minPeakSeverity`, as a fraction of the
   * target: output lost, share of people gone, confidence lost.
   */
  magnitudePerPoint: number;
  /** Plant capacity scars hit this sector only; absent = every sector. */
  sectorType?: string;
  /** Turns for the scar to heal fully. */
  recoveryTurns: number;
}

export type ForcedEventKind =
  "stateOfEmergency" | "strike" | "impeachmentMotion" | "sovereignDefaultPath" | "bankRun";

export interface ForcedEventThreshold {
  id: string;
  event: ForcedEventKind;
  minSeverity: number;
  /** Consecutive turns at or above `minSeverity` before the event fires. */
  sustainedTurns: number;
  stages?: readonly ActiveCrisisStage[];
}

export interface CrisisDefinition {
  id: string;
  source: CrisisSource;
  scope: CrisisScope;
  label: string;
  stages: Record<ActiveCrisisStage, StageRule>;
  thresholds: StageThresholds;
  /** Times a crisis may fall back from aftermath to peak. 0 = never. */
  maxRelapses?: number;
  severity: SeverityModel;
  levers: readonly CrisisLeverDef[];
  effectModules: readonly EffectModuleRef[];
  spillover: readonly SpilloverLink[];
  scarRules: readonly ScarRule[];
  forcedEvents: readonly ForcedEventThreshold[];
  /** Sectors whose corporations the crisis reaches. Absent = every sector in the affected regions. */
  affectedSectors?: readonly string[];
  /**
   * Turns an emergent detector must wait after one of these resolves in a
   * jurisdiction before it can open another there. Absent = `DEFAULT_REOPEN_COOLDOWN_TURNS`.
   */
  reopenCooldownTurns?: number;
}

/** Cooldown applied to a definition that does not set `reopenCooldownTurns`. */
export const DEFAULT_REOPEN_COOLDOWN_TURNS = 24;

export interface SeveritySample {
  turn: number;
  severity: number;
}

/** One row of who held which office and what they did (or failed to do). */
export interface AccountabilityEntry {
  turn: number;
  stage: ActiveCrisisStage;
  role: CrisisRole;
  holderId: string;
  /** Null when the holder had levers available and pulled none. */
  leverId: string | null;
  cost: LeverCost;
  /** Severity points the lever removed. Zero for inaction. */
  mitigation: number;
  /** Severity going into the turn, so blame can weigh how bad it was. */
  severity: number;
}

export interface CrisisScar {
  ruleId: string;
  kind: ScarKind;
  /** A state id for regional crises, a country id otherwise. */
  targetId: string;
  magnitude: number;
  createdTurn: number;
  recoveryTurns: number;
  sectorType?: string;
  /** Loss already written into the world, for scars that heal by writing the difference. */
  applied?: number;
}

/** Progress of the forced-event thresholds on one instance. */
export interface ForcedEventProgress {
  /** Consecutive qualifying turns per threshold id. */
  streaks: Record<string, number>;
  /** Threshold ids that have fired; each fires once per crisis. */
  fired: string[];
}

export interface SpilloverRef {
  crisisId: string;
  definitionId: string;
  linkId: string;
}

/**
 * The live state of a v2 crisis. Stored on the crisis document under `v2`, so
 * documents written before v2 stay valid with the field absent.
 */
export interface CrisisInstance {
  definitionId: string;
  source: CrisisSource;
  scope: CrisisScope;
  stage: CrisisStage;
  startTurn: number;
  stageStartTurn: number;
  severity: number;
  /** Peak severity seen so far; scars size off this. */
  peakSeverity: number;
  severityHistory: SeveritySample[];
  /** Consecutive turns with mitigation under the acting threshold. */
  idleTurns: number;
  relapses: number;
  /** Last turn each lever was pulled, keyed `${leverId}:${holderId}`. */
  leverLastUsed: Record<string, number>;
  ledger: AccountabilityEntry[];
  scars: CrisisScar[];
  parents: SpilloverRef[];
  children: SpilloverRef[];
  /** Turn whose step has been claimed; a claimed turn is never stepped twice. */
  lastEvaluatedTurn?: number;
  forced?: ForcedEventProgress;
  /** Set once a state of emergency is declared; unlocks emergency levers. */
  emergency?: boolean;
  /** Turn the scars were last advanced, so a repeat run cannot heal twice. */
  lastScarTurn?: number;
  /** Which scar pass holds the claim on `lastScarTurn`. */
  scarClaim?: string;
  /** Set once the accountability ledger has been turned into approval and votes. */
  consequencesSettled?: boolean;
}

/** Optional v2 state carried on a stored crisis. */
export interface WithCrisisV2 {
  v2?: CrisisInstance;
}

/** A lever use submitted for the turn being evaluated. */
export interface LeverUse {
  leverId: string;
  holderId: string;
  /** Share of full effect, 0..1. Defaults to 1. */
  intensity?: number;
}

export const STAGE_INDEX: Record<CrisisStage, number> = {
  signal: 0,
  onset: 1,
  peak: 2,
  aftermath: 3,
  resolved: 4,
};

export function isActiveStage(stage: CrisisStage): stage is ActiveCrisisStage {
  return stage !== "resolved";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampSeverity(value: number): number {
  return clamp(value, 0, 100);
}
