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
  /**
   * Per step: how many plan chunks exist, which are applied, and whether every
   * op carried a stamp (an unstamped plan cannot be replayed after a partial apply).
   */
  steps: Partial<
    Record<CorporationTurnStep, { chunks: number; applied: number[]; replayable?: boolean }>
  >;
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
 * update as the money move so a replayed chunk cannot apply twice. A document
 * can carry several ops in one step, so each op has its own slot.
 */
export function stampField(step: CorporationTurnStep, slot = 0): string {
  return `corpTurnApplied.${step}.${slot}`;
}

export interface StampableOp {
  updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> };
}

function isStampable(op: unknown): op is StampableOp {
  if (typeof op !== "object" || op === null || !("updateOne" in op)) return false;
  const { filter, update } = (op as StampableOp).updateOne;
  return (
    typeof filter === "object" &&
    filter !== null &&
    filter._id !== undefined &&
    typeof update === "object" &&
    update !== null &&
    !Array.isArray(update)
  );
}

/** Add the per-turn guard to the filter and the stamp to the update of an updateOne op. */
export function stampOp<T extends StampableOp>(
  op: T,
  step: CorporationTurnStep,
  turn: number,
  slot = 0
): T {
  const field = stampField(step, slot);
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

/**
 * Stamp every op of a plan, numbering the ops that hit the same document.
 * `unstamped` counts ops that cannot carry a stamp (not an updateOne by _id, or a
 * pipeline update); a plan with any of those cannot be replayed safely.
 */
export function stampPlan<T>(
  ops: readonly T[],
  step: CorporationTurnStep,
  turn: number
): { ops: T[]; unstamped: number } {
  const slots = new Map<string, number>();
  let unstamped = 0;
  const out = ops.map((op) => {
    if (!isStampable(op)) {
      unstamped++;
      return op;
    }
    const id = String(op.updateOne.filter._id);
    const slot = slots.get(id) ?? 0;
    slots.set(id, slot + 1);
    return stampOp(op, step, turn, slot) as unknown as T;
  });
  return { ops: out, unstamped };
}

/** Group ops into chunks bounded by op count and by encoded size. */
export function chunkBySize<T>(
  ops: readonly T[],
  sizeOf: (op: T) => number,
  maxOps: number,
  maxBytes: number
): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const op of ops) {
    const size = sizeOf(op);
    if (current.length > 0 && (current.length >= maxOps || bytes + size > maxBytes)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(op);
    bytes += size;
  }
  if (current.length > 0) out.push(current);
  return out;
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
