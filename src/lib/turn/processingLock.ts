import type { GameState } from "@/lib/db/types";
import { workerConfig } from "@/lib/config/worker";

export const TURN_LOCK_STALE_MS = 20 * 60 * 1000;
export const TURN_LOCK_HEARTBEAT_MS = 30_000;

/**
 * Failure threshold for a single turn phase. `runPhase` races every phase against
 * this and records the phase as failed when it is exceeded. The timeout cannot
 * cancel the phase function, so the runtime then holds the turn, with its lock
 * and heartbeat, until that function settles; no later phase starts while it
 * is still writing.
 *
 * Lives here rather than in turnPhaseRuntime so the admin health check can
 * measure phases against the same number the runtime enforces, instead of
 * duplicating a literal that would drift. This module is deliberately
 * dependency-light (types only) so route handlers can import it freely.
 *
 * Raising this constant is not the remedy for slow phases: it reports failure
 * promptly while the drain barrier prevents later work from overlapping the
 * timed-out phase. A permanently hung function requires process recovery.
 */
const DEFAULT_PHASE_TIMEOUT_MS = 4 * 60 * 1000;

/**
 * Per-phase timeout. Defaults to 4 minutes. A deployment can raise it with
 * TURN_PHASE_TIMEOUT_MS (clamped to 1..30 minutes) when slow phases would
 * otherwise time out and drop results that later phases depend on. The
 * turn lock is heartbeat-renewed while a phase runs, so a longer phase does
 * not make the lock look stale.
 */
export function resolvePhaseTimeoutMs(
  raw: string | undefined = workerConfig.turnPhaseTimeoutMs()
): number {
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PHASE_TIMEOUT_MS;
  return Math.min(30 * 60 * 1000, Math.max(60 * 1000, Math.floor(parsed)));
}

export const PHASE_TIMEOUT_MS = resolvePhaseTimeoutMs();

/**
 * Corporate settlement has a fixed ten-minute window; other phases retain their configured limit.
 * Turns 753-761 ran the phase for 287-433 s, so a six-minute window raised a timeout
 * warning on most turns and left every late finish to the drain path. Ten minutes stays
 * under the 20-minute stale-lock cutoff.
 */
export function phaseTimeoutMs(phase: string): number {
  return phase === "corporationTurn" ? 10 * 60 * 1000 : PHASE_TIMEOUT_MS;
}

export type ProcessingLockSnapshot = Pick<
  GameState,
  | "isProcessing"
  | "processingPhase"
  | "processingTargetTurn"
  | "processingHeartbeatAt"
  | "processingStartedAt"
  | "updatedAt"
> &
  Partial<Pick<GameState, "processingAbandonedAt">>;

export function getProcessingLockLastTouch(snapshot: ProcessingLockSnapshot): Date | null {
  return (
    snapshot.processingHeartbeatAt ?? snapshot.processingStartedAt ?? snapshot.updatedAt ?? null
  );
}

/**
 * An abandoned lock is stale immediately: `processingAbandonedAt` is written by
 * the graceful shutdown handler, so there is nothing to wait for.
 *
 * The marker is deliberately NOT a release. Clearing the lock would also wipe
 * `processingPhase` and `processingPhaseStatuses`, destroying the evidence
 * `shouldRecoverCrashedTurn` reads and letting the next cron re-run an
 * already-committed turn.
 */
export function getProcessingLockState(snapshot: ProcessingLockSnapshot, now = new Date()) {
  const lastTouch = getProcessingLockLastTouch(snapshot);
  const staleAfterAt = lastTouch ? new Date(lastTouch.getTime() + TURN_LOCK_STALE_MS) : now;
  const abandoned = snapshot.processingAbandonedAt != null;
  const retryAfterMs =
    lastTouch && !abandoned ? Math.max(0, staleAfterAt.getTime() - now.getTime()) : 0;

  return {
    lastTouch,
    staleAfterAt: abandoned ? (lastTouch ?? now) : staleAfterAt,
    retryAfterMs,
    abandoned,
    isStale: abandoned || !lastTouch || retryAfterMs === 0,
  };
}

/**
 * Whether a turn is actively processing (lock held, not stale). Player-facing
 * mutation routes whose fields are ALSO written by the corp turn's own bulk
 * write (unionization, strikeStartedAtTurn, strikeCooldownUntilTurn on
 * CorporateSector; treasury/approval on Union) must reject during this window:
 * the turn's write recomputes those fields from a pre-mutation snapshot and
 * would silently clobber a paid-for player action with no error surfaced.
 */
export function isTurnProcessingNow(snapshot: ProcessingLockSnapshot, now = new Date()): boolean {
  if (snapshot.isProcessing !== true) return false;
  return !getProcessingLockState(snapshot, now).isStale;
}

export type CrashRecoverySnapshot = ProcessingLockSnapshot &
  Pick<GameState, "processingKind" | "currentTurn">;

/** The phase name a turn holds before any phase has committed anything. */
export const TURN_BOOTSTRAP_PHASE = "turn_bootstrap";

/**
 * Has this turn progressed far enough that re-running it would double-apply?
 *
 * The same question `shouldRecoverCrashedTurn` asks, minus the staleness and ownership
 * checks, so the shutdown handler can ask it about the lock IT holds and decide whether
 * releasing is lossless.
 */
export function turnHasCommittedWrites(phase: string | null | undefined): boolean {
  return !!phase && phase !== TURN_BOOTSTRAP_PHASE;
}

/*
 * Turn-atomicity guard. A turn's ~20 phases each commit DB writes directly and
 * nothing wraps the turn in a transaction (too long for Mongo's per-transaction
 * limits). If the process dies mid-turn, the lock is left held; the stale
 * takeover would otherwise re-run the SAME turn from the start and double-apply
 * every additive-income phase that already committed (fund generation, corp
 * liquidity/dividends, savings interest, bond coupons, caucus tax, treasury),
 * persistent, economy-wide money creation.
 *
 * Returns true when a stale lock belongs to a turn that had already progressed
 * past bootstrap (so phases may have committed). The caller then consumes the
 * turn number instead of re-executing it, leaving the crashed turn partially
 * applied rather than duplicated. A turn stranded at bootstrap applied nothing,
 * so this returns false and the turn is safely re-run.
 *
 * `currentPhase` (durably flushed as the turn runs) is the progress signal.
 * Pure decision: the caller re-checks freshly locked state before acting so a
 * concurrent completion can't be double-counted.
 */
export function shouldRecoverCrashedTurn(
  snapshot: CrashRecoverySnapshot,
  now = new Date()
): boolean {
  if (snapshot.isProcessing !== true) return false; // no lock held → nothing to recover
  if (!getProcessingLockState(snapshot, now).isStale) return false; // healthy in-flight
  if (snapshot.processingKind !== "turn") return false; // some other processing kind
  const target = snapshot.processingTargetTurn;
  if (typeof target !== "number" || target !== snapshot.currentTurn + 1) return false;
  return turnHasCommittedWrites(snapshot.processingPhase);
}
