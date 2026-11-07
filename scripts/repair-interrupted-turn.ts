/**
 * REPAIR AN INTERRUPTED TURN: operator tool for a turn that refused to resume
 * because `corporationTurn` was cut off by a crash or restart.
 *
 * Background: a resume refuses to continue past an interrupted `corporationTurn`
 * (TurnResumeRefusedError). The turn lock stays held with its evidence, because
 * the phase may have committed any prefix of its writes. This tool inspects what
 * actually committed for the target turn, recommends one verdict, and on request
 * flips the phase marker so the ordinary resume path can finish the turn.
 *
 * RUN (dry run by default, writes nothing):
 *
 *   MONGODB_URI='mongodb://...' npx tsx scripts/repair-interrupted-turn.ts
 *   MONGODB_URI='mongodb://...' npx tsx scripts/repair-interrupted-turn.ts --turn 736 --apply
 *
 * `--apply` needs `--turn <N>` and N must equal gameState.processingTargetTurn.
 * Add `--json` for machine output. `--skip-liveness-check` lets apply proceed
 * when the lock heartbeat is under two minutes old (only if you are certain no
 * worker is alive).
 *
 * VERDICTS
 *
 *   NOTHING_COMMITTED  No settlement record, no corporationHistory rows for the
 *                      turn, no sector settled for the turn, no operating-cash
 *                      keys. Safe to run corporationTurn again. `--apply` marks
 *                      the phase failed with reason `mustStop`, the marker the
 *                      engine already reruns on resume.
 *   FULLY_COMMITTED    Settlement record is `settled`, history rows are
 *                      comparable to the previous turn, and no producer sector
 *                      is behind the target turn. `--apply` marks the phase
 *                      completed so the resume skips it.
 *   PARTIAL            Anything else. Refuses to apply. The output lists what is
 *                      present and missing; a manual heal is required.
 *
 * The tool never clears isProcessing or the lock. After `--apply`, the normal
 * resume path takes over once the lock goes stale (20 minutes without a
 * heartbeat) and runs the remaining phases. Phases after corporationTurn that
 * already failed or were interrupted are NOT rerun by that resume; they are
 * listed so you can heal them separately.
 */
import type { Db } from "mongodb";
import { readCrashedTurnPhaseState } from "@/simulation/engine/turnPhaseResumeResults";
import type { TurnPhaseTelemetry, TurnPhaseTelemetryMap } from "@/lib/db/types/turnPhaseTelemetry";

export const REPAIR_PHASE = "corporationTurn";
/** History rows for the target turn must reach this share of the previous turn's. */
export const HISTORY_COMPARABLE_RATIO = 0.95;
/** A lock touched more recently than this may still have a live holder. */
export const LIVENESS_WINDOW_MS = 2 * 60 * 1000;

export type RepairVerdict = "NOTHING_COMMITTED" | "FULLY_COMMITTED" | "PARTIAL";

export interface TurnRepairEvidence {
  targetTurn: number;
  currentTurn: number | null;
  worldEpoch: string | null;
  isProcessing: boolean;
  lockTouchedAt: Date | null;
  phases: { completed: string[]; interrupted: string[]; failed: string[]; other: string[] };
  /** Phase marker the apply compares against, so a concurrent change aborts it. */
  corporationTurnStatus: TurnPhaseTelemetry | null;
  corporationTurnInterrupted: boolean;
  settlementRecordStatus: "frozen" | "settled" | "absent" | "unknown";
  historyRowsTarget: number;
  historyRowsPrevious: number;
  sectorsSettledAtTarget: number;
  sectorsBehindTarget: number;
  operatingCashKeys: number;
}

export interface TurnRepairPlan {
  evidence: TurnRepairEvidence;
  verdict: RepairVerdict;
  present: string[];
  missing: string[];
  /** Phases after the repaired one that a resume will not rerun. */
  downstreamNotRerun: string[];
}

export class RepairRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepairRefusedError";
  }
}

interface GameStateDoc {
  currentTurn?: number;
  worldEpochId?: string;
  isProcessing?: boolean;
  processingTargetTurn?: number | null;
  processingPhaseStatuses?: TurnPhaseTelemetryMap | null;
  processingPhaseResults?: unknown;
  processingHeartbeatAt?: Date | null;
  processingStartedAt?: Date | null;
}

export async function inspectInterruptedTurn(db: Db): Promise<TurnRepairPlan> {
  const state = await db.collection<GameStateDoc & { _id: string }>("gameState").findOne({
    _id: "current",
  });
  if (!state) throw new RepairRefusedError("gameState document not found");
  const target = state.processingTargetTurn;
  if (typeof target !== "number") {
    throw new RepairRefusedError("No turn is in progress (processingTargetTurn is empty).");
  }
  const statuses = state.processingPhaseStatuses ?? {};
  const crashed = readCrashedTurnPhaseState(statuses, state.processingPhaseResults);
  const phases = {
    completed: [] as string[],
    interrupted: [] as string[],
    failed: [] as string[],
    other: [] as string[],
  };
  for (const [name, t] of Object.entries(statuses)) {
    if (crashed.interrupted.has(name)) phases.interrupted.push(name);
    else if (t.status === "completed" || crashed.completed.has(name)) phases.completed.push(name);
    else if (t.status === "failed") phases.failed.push(name);
    else phases.other.push(name);
  }
  const epoch = state.worldEpochId ?? null;

  const record = epoch
    ? await db
        .collection<{ _id: string; status?: string }>("producerEconomyTurns")
        .findOne({ _id: JSON.stringify([epoch, target]) })
    : null;
  const settlementRecordStatus: TurnRepairEvidence["settlementRecordStatus"] = !epoch
    ? "unknown"
    : !record
      ? "absent"
      : record.status === "settled"
        ? "settled"
        : "frozen";

  const history = db.collection("corporationHistory");
  const sectors = db.collection("corporateSectors");
  const [historyRowsTarget, historyRowsPrevious, sectorsSettledAtTarget, sectorsBehindTarget] =
    await Promise.all([
      history.countDocuments({ turn: target }),
      history.countDocuments({ turn: target - 1 }),
      sectors.countDocuments({ "producerSettlement.turn": target }),
      sectors.countDocuments({ "producerSettlement.turn": { $lt: target } }),
    ]);
  const operatingCashKeys = await db.collection("bankMoneyMoves").countDocuments({
    _id: { $regex: `^corp-operating-cash:${target}:` } as never,
  });

  const evidence: TurnRepairEvidence = {
    targetTurn: target,
    currentTurn: state.currentTurn ?? null,
    worldEpoch: epoch,
    isProcessing: state.isProcessing === true,
    lockTouchedAt: state.processingHeartbeatAt ?? state.processingStartedAt ?? null,
    phases,
    corporationTurnStatus: statuses[REPAIR_PHASE] ?? null,
    corporationTurnInterrupted: crashed.interrupted.has(REPAIR_PHASE),
    settlementRecordStatus,
    historyRowsTarget,
    historyRowsPrevious,
    sectorsSettledAtTarget,
    sectorsBehindTarget,
    operatingCashKeys,
  };
  return {
    evidence,
    ...decide(evidence),
    downstreamNotRerun: [...phases.interrupted, ...phases.failed].filter((p) => p !== REPAIR_PHASE),
  };
}

function historyComparable(e: TurnRepairEvidence): boolean {
  if (e.historyRowsTarget === 0) return false;
  if (e.historyRowsPrevious === 0) return true;
  return e.historyRowsTarget >= e.historyRowsPrevious * HISTORY_COMPARABLE_RATIO;
}

export function decide(
  e: TurnRepairEvidence
): Pick<TurnRepairPlan, "verdict" | "present" | "missing"> {
  const present: string[] = [];
  const missing: string[] = [];
  const note = (ok: boolean, yes: string, no: string) =>
    (ok ? present : missing).push(ok ? yes : no);
  note(
    e.settlementRecordStatus === "settled",
    "producer settlement record: settled",
    `producer settlement record: ${e.settlementRecordStatus}`
  );
  note(
    historyComparable(e),
    `corporationHistory rows: ${e.historyRowsTarget} (previous turn ${e.historyRowsPrevious})`,
    `corporationHistory rows: ${e.historyRowsTarget} (previous turn ${e.historyRowsPrevious}, need at least ${HISTORY_COMPARABLE_RATIO * 100}%)`
  );
  note(
    e.sectorsSettledAtTarget > 0 && e.sectorsBehindTarget === 0,
    `sectors settled for the turn: ${e.sectorsSettledAtTarget}, none behind`,
    `sectors settled for the turn: ${e.sectorsSettledAtTarget}, still behind: ${e.sectorsBehindTarget}`
  );
  note(
    e.operatingCashKeys > 0,
    `operating-cash keys: ${e.operatingCashKeys}`,
    "operating-cash keys: 0"
  );

  const nothing =
    e.settlementRecordStatus === "absent" &&
    e.historyRowsTarget === 0 &&
    e.sectorsSettledAtTarget === 0 &&
    e.operatingCashKeys === 0;
  if (nothing) return { verdict: "NOTHING_COMMITTED", present: [], missing };
  const full =
    e.settlementRecordStatus === "settled" &&
    historyComparable(e) &&
    e.sectorsSettledAtTarget > 0 &&
    e.sectorsBehindTarget === 0;
  if (full) return { verdict: "FULLY_COMMITTED", present, missing: [] };
  return { verdict: "PARTIAL", present, missing };
}

export function describePlan(plan: TurnRepairPlan): string[] {
  const e = plan.evidence;
  const lines = [
    `Target turn: ${e.targetTurn} (current turn ${e.currentTurn}, world ${e.worldEpoch ?? "unknown"})`,
    `Lock held: ${e.isProcessing ? "yes" : "no"}, last touched ${e.lockTouchedAt?.toISOString() ?? "unknown"}`,
    `Phases completed: ${e.phases.completed.length}`,
    `Phases interrupted: ${e.phases.interrupted.join(", ") || "none"}`,
    `Phases failed: ${e.phases.failed.join(", ") || "none"}`,
    `${REPAIR_PHASE} marker: ${e.corporationTurnStatus?.status ?? "absent"}${e.corporationTurnInterrupted ? " (interrupted)" : ""}`,
    `Evidence for turn ${e.targetTurn}:`,
    `  producerEconomyTurns record: ${e.settlementRecordStatus}`,
    `  corporationHistory rows: ${e.historyRowsTarget} (turn ${e.targetTurn - 1}: ${e.historyRowsPrevious})`,
    `  corporateSectors settled for the turn: ${e.sectorsSettledAtTarget}, behind: ${e.sectorsBehindTarget}`,
    `  operating-cash keys in bankMoneyMoves: ${e.operatingCashKeys}`,
    `VERDICT: ${plan.verdict}`,
  ];
  if (plan.verdict === "PARTIAL") {
    lines.push(
      "Present:",
      ...plan.present.map((p) => `  ${p}`),
      "Missing:",
      ...plan.missing.map((p) => `  ${p}`)
    );
    lines.push("Refusing to apply: a manual heal is required.");
  }
  if (plan.downstreamNotRerun.length)
    lines.push(
      `WARNING: a resume will not rerun these already failed or interrupted phases: ${plan.downstreamNotRerun.join(", ")}`
    );
  return lines;
}

function nextStepText(verdict: RepairVerdict): string {
  if (verdict === "NOTHING_COMMITTED")
    return `--apply marks ${REPAIR_PHASE} failed/mustStop. The next resume (after the lock goes stale) reruns it, then the remaining phases.`;
  if (verdict === "FULLY_COMMITTED")
    return `--apply marks ${REPAIR_PHASE} completed. The next resume skips it and runs the remaining phases.`;
  return "Nothing will be written.";
}

export function repairMarker(
  verdict: Exclude<RepairVerdict, "PARTIAL">,
  prior: TurnPhaseTelemetry | null,
  now: Date
): TurnPhaseTelemetry {
  if (verdict === "NOTHING_COMMITTED")
    return {
      status: "failed",
      startedAt: null,
      completedAt: now,
      updatedAt: now,
      reason: "mustStop",
      message: "operator repair: verified nothing committed; rerun on resume",
    };
  return {
    status: "completed",
    startedAt: prior?.startedAt ?? null,
    completedAt: now,
    updatedAt: now,
    reason: null,
    message: "operator repair: verified fully committed; marked completed",
  };
}

export async function applyRepair(
  db: Db,
  plan: TurnRepairPlan,
  opts: { turn: number | null; now: Date; skipLivenessCheck?: boolean }
): Promise<TurnPhaseTelemetry> {
  const e = plan.evidence;
  if (opts.turn === null) throw new RepairRefusedError("--apply requires --turn <N>.");
  if (opts.turn !== e.targetTurn)
    throw new RepairRefusedError(
      `--turn ${opts.turn} does not match processingTargetTurn ${e.targetTurn}.`
    );
  if (plan.verdict === "PARTIAL")
    throw new RepairRefusedError("Verdict is PARTIAL: a manual heal is required. Nothing written.");
  if (!e.isProcessing)
    throw new RepairRefusedError("The turn lock is not held; nothing to repair.");
  if (!e.corporationTurnInterrupted)
    throw new RepairRefusedError(`${REPAIR_PHASE} is not marked interrupted; nothing to repair.`);
  if (
    !opts.skipLivenessCheck &&
    e.lockTouchedAt &&
    opts.now.getTime() - e.lockTouchedAt.getTime() < LIVENESS_WINDOW_MS
  )
    throw new RepairRefusedError(
      "The lock was touched in the last 2 minutes; a worker may be alive. Re-run later."
    );
  const marker = repairMarker(plan.verdict, e.corporationTurnStatus, opts.now);
  const guard: Record<string, unknown> = {
    _id: "current",
    isProcessing: true,
    processingTargetTurn: e.targetTurn,
  };
  guard[`processingPhaseStatuses.${REPAIR_PHASE}.updatedAt`] =
    e.corporationTurnStatus?.updatedAt ?? null;
  const res = await db
    .collection("gameState")
    .updateOne(
      guard as never,
      { $set: { [`processingPhaseStatuses.${REPAIR_PHASE}`]: marker } } as never
    );
  if (res.matchedCount !== 1)
    throw new RepairRefusedError(
      "Game state changed while repairing; nothing written. Re-run the dry run."
    );
  return marker;
}

function parseArgs(argv: string[]) {
  const turnIdx = argv.indexOf("--turn");
  const raw = turnIdx >= 0 ? argv[turnIdx + 1] : undefined;
  const turn = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
  return {
    turn,
    turnGiven: turnIdx >= 0,
    apply: argv.includes("--apply"),
    json: argv.includes("--json"),
    skipLivenessCheck: argv.includes("--skip-liveness-check"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.turnGiven && args.turn === null) {
    console.error("--turn needs a whole number.");
    process.exit(2);
  }
  const { connectDb, closeDb } = await import("./utils/db");
  const db = await connectDb();
  let code = 0;
  try {
    const plan = await inspectInterruptedTurn(db);
    if (args.json) console.log(JSON.stringify(plan, null, 2));
    else console.log(describePlan(plan).join("\n"));
    if (!args.apply) {
      console.log(`DRY RUN: nothing written. ${nextStepText(plan.verdict)}`);
    } else {
      const marker = await applyRepair(db, plan, {
        turn: args.turn,
        now: new Date(),
        skipLivenessCheck: args.skipLivenessCheck,
      });
      console.log(
        `APPLIED: ${REPAIR_PHASE} marked ${marker.status}${marker.reason ? `/${marker.reason}` : ""}.`
      );
      console.log(
        "The lock and isProcessing were not touched. " +
          nextStepText(plan.verdict).replace(/^--apply /, "This ")
      );
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    code = err instanceof RepairRefusedError ? 3 : 1;
  } finally {
    await closeDb();
  }
  process.exit(code);
}

if (process.argv[1] && /repair-interrupted-turn\.[tj]s$/.test(process.argv[1])) void main();
