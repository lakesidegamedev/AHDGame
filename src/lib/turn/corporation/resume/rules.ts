/**
 * Rules for resuming an interrupted corporation turn. Plain data in, plain data
 * out: the shell loads and stores the journal, this decides.
 */

export const CORPORATION_TURN_STEPS = [
  "sectorWrites",
  "corporationCash",
  "developmentCash",
] as const;

export type CorporationTurnStep = (typeof CORPORATION_TURN_STEPS)[number];

export type StepStatus = "planned" | "applying" | "applied";

export interface CorporationTurnJournal {
  turn: number;
  /** Per step: how many plan chunks exist and which are applied. */
  steps: Partial<Record<CorporationTurnStep, { chunks: number; applied: number[] }>>;
}

export function resilienceStageOf(
  config: { turnResilienceStage?: number } | null | undefined
): number {
  const stage = config?.turnResilienceStage;
  return typeof stage === "number" && Number.isFinite(stage) && stage > 0 ? Math.floor(stage) : 0;
}

export function stepStatus(
  journal: CorporationTurnJournal,
  step: CorporationTurnStep
): StepStatus | null {
  const entry = journal.steps[step];
  if (!entry) return null;
  if (entry.applied.length >= entry.chunks) return "applied";
  return entry.applied.length > 0 ? "applying" : "planned";
}

/** Split a stored plan into chunks small enough to persist as separate documents. */
export function chunkPlan<T>(ops: readonly T[], size: number): T[][] {
  if (!(size > 0)) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < ops.length; i += size) out.push(ops.slice(i, i + size));
  return out;
}

/** Chunk indexes still to apply, in order. */
export function remainingChunks(
  journal: CorporationTurnJournal,
  step: CorporationTurnStep
): number[] {
  const entry = journal.steps[step];
  if (!entry) return [];
  const done = new Set(entry.applied);
  return Array.from({ length: entry.chunks }, (_, i) => i).filter((i) => !done.has(i));
}

/**
 * Field that records the last turn a step wrote an entity, set in the same
 * update as the money move so a replayed chunk cannot apply twice.
 */
export function stampField(step: CorporationTurnStep): string {
  return `corpTurnApplied.${step}`;
}

export interface StampableOp {
  updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> };
}

/** Add the per-turn guard to the filter and the stamp to the update of an updateOne op. */
export function stampOp<T extends StampableOp>(op: T, step: CorporationTurnStep, turn: number): T {
  const field = stampField(step);
  const { filter, update } = op.updateOne;
  const existingSet = (update.$set ?? {}) as Record<string, unknown>;
  return {
    ...op,
    updateOne: {
      ...op.updateOne,
      filter: { ...filter, [field]: { $ne: turn } },
      update: { ...update, $set: { ...existingSet, [field]: turn } },
    },
  };
}

export type ResumeVerdict = { resume: true } | { resume: false; reason: string };

/**
 * An interrupted corporation turn may resume only when every step it had begun
 * is journaled chunk by chunk. Work done outside the journaled steps is not yet
 * covered, so the caller passes whether the turn reached the first unjournaled
 * write (`unjournaledWritesStarted`).
 */
export function corporationTurnResumeVerdict(args: {
  stage: number;
  journal: CorporationTurnJournal | null;
  turn: number;
  unjournaledWritesStarted: boolean;
}): ResumeVerdict {
  if (args.stage < 2) return { resume: false, reason: "turn resilience stage below 2" };
  if (!args.journal) return { resume: false, reason: "no journal for this turn" };
  if (args.journal.turn !== args.turn)
    return { resume: false, reason: "journal belongs to another turn" };
  if (args.unjournaledWritesStarted)
    return { resume: false, reason: "writes outside the journaled steps already started" };
  return { resume: true };
}
