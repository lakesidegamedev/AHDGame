import { getDb } from "@/lib/mongodb";
import { centralLoginShadowEventsCollection } from "@/lib/db/repositories/centralLoginShadowEvents";
import { shadowMatches, type LocalPasswordResult, type PasswordCheckOutcome } from "./rules";

export type ShadowEventKind =
  "password" | "apple" | "google" | "discord" | "write" | "bridge" | "hop";
export type ShadowCentralResult = PasswordCheckOutcome | "n/a";

export type ShadowEventReason =
  | "long_password"
  | "restore"
  | "restore_unavailable"
  | "unknown_heal"
  | "breaker_open"
  | "hop_ticket_failed"
  | "hop_no_flow"
  | "hop_state"
  | "hop_provider_error"
  | "hop_exchange"
  | "hop_token"
  | "hop_nonce"
  | "hop_no_session"
  | "hop_user_mismatch"
  | "hop_issuer_not_ready";

export interface ShadowEvent {
  userId: string;
  kind: ShadowEventKind;
  local: LocalPasswordResult | "n/a";
  central: ShadowCentralResult;
  match: boolean;
  /** Set when central mode served a login from the local copy. */
  fallback?: boolean;
  /** Why a comparison was skipped or what a write was for. */
  reason?: ShadowEventReason;
  /** unknown_heal events: whether the central account was recreated. */
  healed?: boolean;
  /** Outcome of a Lakeside session hop (`hop` events). */
  hop?: "ok" | "failed";
  /** Bridge operation for `write` events. */
  op?: "password-set" | "account-upsert" | "account-delete";
  at: Date;
}

export function passwordShadowEvent(
  userId: string,
  local: LocalPasswordResult,
  central: PasswordCheckOutcome,
  fallback = false
): ShadowEvent {
  return {
    userId,
    kind: "password",
    local,
    central,
    match: shadowMatches(local, central),
    ...(fallback ? { fallback: true } : {}),
    at: new Date(),
  };
}

/** Never throws: telemetry must not affect a sign-in or a credential write. */
export async function recordShadowEvent(event: ShadowEvent): Promise<void> {
  try {
    const db = await getDb();
    await centralLoginShadowEventsCollection<ShadowEvent>(db).insertOne({ ...event });
  } catch {
    // Telemetry only.
  }
}

export interface ShadowSummary {
  windowStart: Date;
  windowEnd: Date;
  total: number;
  match: number;
  mismatch: number;
  error: number;
  timeout: number;
  fallback: number;
  /** Logins skipped because the password is too long to check centrally. */
  longPassword: number;
  /** Central did not know the account; the local copy decided and the account was recreated. */
  unknownHeal: number;
  /** Bridge calls the circuit breaker skipped. Failed calls are counted in error and timeout. */
  breakerOpen: number;
  /** Lakeside session hops that completed. */
  hopOk: number;
  /** Lakeside session hops that fell through to the plain destination. */
  hopFailed: number;
}

/** Counts for a later admin view. Mismatch excludes failures and skipped (n/a) events. */
export async function summarizeShadowEvents(
  windowMs: number,
  now: Date = new Date()
): Promise<ShadowSummary> {
  const windowStart = new Date(now.getTime() - windowMs);
  const db = await getDb();
  const rows = await centralLoginShadowEventsCollection(db)
    .aggregate<{
      _id: {
        match: boolean;
        central: string;
        fallback: boolean;
        reason: string;
        hop: string;
      };
      count: number;
    }>([
      { $match: { at: { $gte: windowStart, $lte: now } } },
      {
        $group: {
          _id: {
            match: "$match",
            central: "$central",
            fallback: { $ifNull: ["$fallback", false] },
            reason: { $ifNull: ["$reason", ""] },
            hop: { $ifNull: ["$hop", ""] },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const summary: ShadowSummary = {
    windowStart,
    windowEnd: now,
    total: 0,
    match: 0,
    mismatch: 0,
    error: 0,
    timeout: 0,
    fallback: 0,
    longPassword: 0,
    unknownHeal: 0,
    breakerOpen: 0,
    hopOk: 0,
    hopFailed: 0,
  };
  for (const { _id, count } of rows) {
    summary.total += count;
    if (_id.fallback) summary.fallback += count;
    if (_id.hop === "ok") summary.hopOk += count;
    else if (_id.hop === "failed") summary.hopFailed += count;
    else if (_id.reason === "breaker_open") summary.breakerOpen += count;
    else if (_id.reason === "long_password") summary.longPassword += count;
    else if (_id.reason === "unknown_heal") summary.unknownHeal += count;
    else if (_id.central === "error") summary.error += count;
    else if (_id.central === "timeout") summary.timeout += count;
    else if (_id.match) summary.match += count;
    else if (_id.central !== "n/a") summary.mismatch += count;
  }
  return summary;
}
