import { getDb } from "@/lib/mongodb";
import { centralLoginShadowEventsCollection } from "@/lib/db/repositories/centralLoginShadowEvents";
import { shadowMatches, type LocalPasswordResult, type PasswordCheckOutcome } from "./rules";

export type ShadowEventKind = "password" | "apple" | "google" | "discord" | "write";
export type ShadowCentralResult = PasswordCheckOutcome | "n/a";

export interface ShadowEvent {
  userId: string;
  kind: ShadowEventKind;
  local: LocalPasswordResult | "n/a";
  central: ShadowCentralResult;
  match: boolean;
  /** Set when central mode served a login from the local copy. */
  fallback?: boolean;
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
}

/** Counts for a later admin view. Mismatch excludes failures and skipped (n/a) events. */
export async function summarizeShadowEvents(
  windowMs: number,
  now: Date = new Date()
): Promise<ShadowSummary> {
  const windowStart = new Date(now.getTime() - windowMs);
  const db = await getDb();
  const rows = await centralLoginShadowEventsCollection(db)
    .aggregate<{ _id: { match: boolean; central: string; fallback: boolean }; count: number }>([
      { $match: { at: { $gte: windowStart, $lte: now } } },
      {
        $group: {
          _id: {
            match: "$match",
            central: "$central",
            fallback: { $ifNull: ["$fallback", false] },
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
  };
  for (const { _id, count } of rows) {
    summary.total += count;
    if (_id.fallback) summary.fallback += count;
    if (_id.central === "error") summary.error += count;
    else if (_id.central === "timeout") summary.timeout += count;
    else if (_id.match) summary.match += count;
    else if (_id.central !== "n/a") summary.mismatch += count;
  }
  return summary;
}
