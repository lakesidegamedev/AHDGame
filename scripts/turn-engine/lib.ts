/**
 * Shared pieces of the turn-engine benchmark and parity harness.
 *
 * These scripts advance a REAL turn on a REAL database, so every entry point
 * refuses a non-local Mongo URI. They are the only thing allowed to flip
 * `gameConfig.turnEngineVersion`, and only on those local copies.
 */

import type { Db } from "mongodb";

/** Collections whose writes are runtime telemetry, not world state. */
export const TELEMETRY_COLLECTIONS = new Set([
  "actionAuditLog",
  "apiAccessLog",
  "analyticsRecords",
  "turnLogs",
  "postTurnScans",
  "serverMetrics",
  "__bench_cursor_probe",
]);

/**
 * Fields ignored in the document diff, per collection. Timestamps are wall-clock
 * by nature and carry no game decision; everything else that lands here must be
 * justified in the README because ignoring a field can hide an outcome change.
 */
export const IGNORED_FIELDS: Record<string, readonly string[]> = {
  // Wall-clock stamps written by `new Date()` in the repository layer. The turn
  // is identified by `gameState.currentTurn`; these fields carry no decision.
  "*": ["createdAt", "updatedAt", "lastUpdated", "lastMarketTickAt", "lastTurnProcessed"],
  // The harness sets the selector before the turn and the turn log records which
  // engine actually ran, so the field itself is an input, not an outcome.
  gameConfig: ["turnEngineVersion"],
  // The turn-processsing block is runtime telemetry on the live gameState doc:
  // heartbeats, phase statuses, the engine stamp and the lock. The committed
  // fields that ARE game state (currentTurn, lastTurnProcessed, budgets) are
  // still compared.
  gameState: [
    "processingStartedAt",
    "processingHeartbeatAt",
    "processingPhase",
    "processingPhaseStatuses",
    "processingPhaseResults",
    "processingTargetTurn",
    "processingEngine",
    "processingEngineVersion",
    "processingAbandonedAt",
    "nextScheduledTurn",
  ],
  // Idempotency bookkeeping keyed by per-run move ids: the keys are runtime
  // identifiers, not economic state. Balances and interest ARE compared.
  savingsAccounts: ["lastSettlementKey", "settledKeys", "settlementProjectionRevision"],
  bankMoneyMoves: ["settlementKey"],
};

/**
 * Field names whose value is a wall-clock instant, dropped at any depth.
 *
 * Two runs of the SAME engine start minutes apart, so every one of these
 * differs by construction and says nothing about the outcome. The game clock
 * that does matter is `gameState.currentTurn` and `turnLogs.gameTime`, which are
 * compared. Kept as an explicit list (not a `/At$/` pattern) so a new field has
 * to be looked at before it is silenced.
 */
export const TIMESTAMP_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "lastUpdated",
  "lastMarketTickAt",
  "lastTurnProcessed",
  "expiresAt",
  "timestamp",
  "computedAt",
  "proposedAt",
  "lastDecayApplied",
  "at",
  "completedAt",
  "startedAt",
  "resolvedAt",
  "settledAt",
  "openedAt",
  "closedAt",
  "paidAt",
  "postedAt",
  "fundedAt",
  "recordedAt",
  "generatedAt",
  "observedAt",
]);

export function isLocalMongoUri(uri: string): boolean {
  if (!uri || uri.startsWith("mongodb+srv://")) return false;
  const hostPart = uri
    .replace(/^mongodb:\/\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("@")
    .pop();
  if (!hostPart) return false;
  return hostPart.split(",").every((hostPort) => {
    const host = hostPort.split(":")[0].replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  });
}

export function assertLocalMongoUri(uri: string, what: string): void {
  if (!isLocalMongoUri(uri)) {
    throw new Error(
      `Refusing to run ${what} against a non-local database (${uri ? "remote uri" : "unset"}). ` +
        "The harness advances a real turn and may only touch restored copies."
    );
  }
}

/** `-0`, `NaN` and float noise must not produce phantom diffs. */
export function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function ignoredFor(collection: string): Set<string> {
  return new Set([...(IGNORED_FIELDS["*"] ?? []), ...(IGNORED_FIELDS[collection] ?? [])]);
}

/**
 * Canonical JSON-ready copy of a document: sorted keys, Dates as ISO strings,
 * ObjectIds as hex, ignored fields dropped, numbers de-noised.
 *
 * `dropId` is used for INSERT events: two engines that insert the same document
 * generate different ObjectIds, and the `_id` itself is not game state.
 */
export function canonicalDoc(
  collection: string,
  doc: Record<string, unknown> | null,
  options: { dropId?: boolean } = {}
): Record<string, unknown> | null {
  if (!doc) return null;
  const ignored = ignoredFor(collection);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(doc).sort()) {
    if (options.dropId && key === "_id") continue;
    if (ignored.has(key)) continue;
    out[key] = canonicalValue(doc[key]);
  }
  return out;
}

function canonicalValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return normalizeNumber(value);
  // Runtime idempotency keys (`fund-redemption-batch:<id>:<uuid>#leg7`) embed a
  // random UUID. The key is an opaque claim token, never a game decision, so it
  // is normalised instead of compared.
  if (typeof value === "string") return normalizeEmbeddedIds(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "toHexString" in value) {
    return (value as { toHexString(): string }).toHexString();
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (TIMESTAMP_FIELDS.has(key)) continue;
      out[key] = canonicalValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

const EMBEDDED_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Replace every UUID inside a string (settlement keys embed them). */
export function normalizeEmbeddedIds(value: string): string {
  return value.replace(EMBEDDED_UUID_RE, "<uuid>");
}

/** Stable string for multiset comparison of inserted documents. */
export function canonicalKey(value: unknown): string {
  return JSON.stringify(value);
}

/** Per-currency money totals the two engines must agree on. */
export interface MoneyTotals {
  cash: Record<string, number>;
  deposits: Record<string, number>;
  loans: Record<string, number>;
  bonds: Record<string, number>;
  treasury: Record<string, number>;
}

function addTo(map: Record<string, number>, currency: string, amount: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  map[currency] = normalizeNumber((map[currency] ?? 0) + amount);
}

export async function readMoneyTotals(db: Db): Promise<MoneyTotals> {
  const totals: MoneyTotals = { cash: {}, deposits: {}, loans: {}, bonds: {}, treasury: {} };

  // Cash: personal balances on characters + corporate liquid capital.
  const characters = await db
    .collection("characters")
    .find({}, { projection: { currencyBalances: 1 } })
    .toArray();
  for (const character of characters) {
    const personal = (character.currencyBalances as Record<string, unknown> | undefined)?.personal;
    if (!personal || typeof personal !== "object") continue;
    for (const [currency, amount] of Object.entries(personal as Record<string, unknown>)) {
      if (typeof amount === "number") addTo(totals.cash, currency, amount);
    }
  }
  const corporations = await db
    .collection("corporations")
    .find({}, { projection: { liquidCapital: 1, liquidCurrencyCode: 1, countryId: 1 } })
    .toArray();
  for (const corporation of corporations) {
    if (typeof corporation.liquidCapital !== "number") continue;
    const currency =
      (corporation.liquidCurrencyCode as string | undefined) ??
      (corporation.countryId as string | undefined) ??
      "UNKNOWN";
    addTo(totals.cash, currency, corporation.liquidCapital);
  }

  // Deposits: open savings-account balances.
  const savings = await db
    .collection("savingsAccounts")
    .find({ status: "open" }, { projection: { currency: 1, balance: 1 } })
    .toArray();
  for (const account of savings) {
    if (typeof account.balance === "number") {
      addTo(totals.deposits, String(account.currency ?? "UNKNOWN"), account.balance);
    }
  }

  // Loans: outstanding principal on live bank loans.
  const loans = await db
    .collection("bankLoans")
    .find(
      { status: { $in: ["current", "arrears"] } },
      { projection: { currency: 1, outstanding: 1 } }
    )
    .toArray();
  for (const loan of loans) {
    if (typeof loan.outstanding === "number") {
      addTo(totals.loans, String(loan.currency ?? "UNKNOWN"), loan.outstanding);
    }
  }

  // Bonds: unmatured issuance, in each bond's own currency.
  const bonds = await db
    .collection("bonds")
    .find({ matured: { $ne: true } }, { projection: { currencyCode: 1, totalIssued: 1 } })
    .toArray();
  for (const bond of bonds) {
    if (typeof bond.totalIssued === "number") {
      addTo(totals.bonds, String(bond.currencyCode ?? "UNKNOWN"), bond.totalIssued);
    }
  }

  // Treasury: sovereign cash held by every federal budget.
  const budgets = await db
    .collection("federalBudget")
    .find({}, { projection: { currencyCode: 1, treasuryCashLocal: 1, treasuryBalance: 1 } })
    .toArray();
  for (const budget of budgets) {
    const amount =
      typeof budget.treasuryCashLocal === "number"
        ? budget.treasuryCashLocal
        : typeof budget.treasuryBalance === "number"
          ? budget.treasuryBalance
          : 0;
    addTo(totals.treasury, String(budget.currencyCode ?? "UNKNOWN"), amount);
  }

  return totals;
}

export interface TrialBalanceResult {
  entries: number;
  unbalanced: number;
  maxAbsResidual: number;
}

/**
 * Trial balance for one turn: every ledger entry's legs must net to zero.
 * Independent of the game's own reconcile phase, which can be flag-gated off.
 */
export async function readTrialBalance(db: Db, turn: number): Promise<TrialBalanceResult> {
  const rows = await db
    .collection("ledgerEntries")
    .aggregate<{ entries: number; unbalanced: number; maxAbsResidual: number }>([
      { $match: { turn } },
      {
        $project: {
          residual: {
            $sum: {
              $map: { input: "$legs", as: "leg", in: { $ifNull: ["$$leg.anchorAmount", 0] } },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          entries: { $sum: 1 },
          unbalanced: {
            $sum: { $cond: [{ $gt: [{ $abs: "$residual" }, 0.01] }, 1, 0] },
          },
          maxAbsResidual: { $max: { $abs: "$residual" } },
        },
      },
    ])
    .toArray();
  const row = rows[0];
  return {
    entries: row?.entries ?? 0,
    unbalanced: row?.unbalanced ?? 0,
    maxAbsResidual: normalizeNumber(row?.maxAbsResidual ?? 0),
  };
}

/** Field-level differences between two canonical docs, bounded for reporting. */
export function diffDocs(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null,
  limit = 8
): string[] {
  const out: string[] = [];
  walk("", left, right, out, limit);
  return out;
}

function walk(prefix: string, left: unknown, right: unknown, out: string[], limit: number): void {
  if (out.length >= limit) return;
  if (typeof left === "number" && typeof right === "number") {
    if (normalizeNumber(left) !== normalizeNumber(right)) {
      out.push(`${prefix}: ${left} != ${right}`);
    }
    return;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      out.push(`${prefix}: length ${left.length} != ${right.length}`);
      return;
    }
    for (let i = 0; i < left.length; i += 1) walk(`${prefix}[${i}]`, left[i], right[i], out, limit);
    return;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      walk(
        prefix ? `${prefix}.${key}` : key,
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        out,
        limit
      );
      if (out.length >= limit) return;
    }
    return;
  }
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    out.push(`${prefix}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`);
  }
}
