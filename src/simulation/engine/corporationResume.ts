/**
 * Decides whether an interrupted corporationTurn may rerun on a crash resume.
 * Stage 2 only, and only when the corporation turn journal covers this turn.
 */
import type { Db } from "mongodb";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import {
  clearJournalForTurn,
  pruneJournal,
  readJournal,
  type JournalContext,
} from "@/lib/turn/corporation/resume/journal";
import {
  corporationTurnResumeVerdict,
  resilienceStageOf,
} from "@/lib/turn/corporation/resume/rules";

interface LockedState {
  currentTurn: number;
  worldEpochId?: string | null;
  processingTargetTurn?: number | null;
  processingPhaseStatuses?: Record<string, { status?: string } | undefined> | null;
}

/** Phases to rerun instead of refusing. Empty unless stage 2 and the journal covers the turn. */
export async function corporationTurnRerunSet(
  db: Db,
  state: LockedState
): Promise<ReadonlySet<string>> {
  const target = state.processingTargetTurn;
  const status = state.processingPhaseStatuses?.corporationTurn?.status;
  if (typeof target !== "number" || (status !== "running" && status !== "failed")) return new Set();
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { turnResilienceStage: 1 } }
  );
  const stage = resilienceStageOf(config);
  if (stage < 2) return new Set();
  const ctx: JournalContext = { db, stage, turn: target, worldEpoch: state.worldEpochId };
  const verdict = corporationTurnResumeVerdict({
    stage,
    journal: await readJournal(ctx),
    turn: target,
  });
  return verdict.resume ? new Set(["corporationTurn"]) : new Set();
}

/** A turn that starts fresh clears stale journal rows for its number and prunes old turns. */
export async function startFreshJournal(
  db: Db,
  stage: number,
  turn: number,
  worldEpoch: string | null | undefined
): Promise<void> {
  if (stage < 2) return;
  const ctx: JournalContext = { db, stage, turn, worldEpoch };
  await clearJournalForTurn(ctx);
  await pruneJournal(ctx);
}
