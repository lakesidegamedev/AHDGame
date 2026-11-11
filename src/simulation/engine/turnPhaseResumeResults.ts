/**
 * Crash-resume results for phases whose output a later phase consumes.
 *
 * A resumed turn skips phases the dead holder already applied, so those return
 * nothing. Safe only for phases nobody downstream reads. `bondTurn` is not one:
 * V2 treasury cash settles from its flows. A phase listed here persists a
 * bounded typed copy of its result in the same write that marks it complete,
 * and resume hands that copy back instead of rerunning.
 *
 * Plain data only: no database, clock or environment.
 */
import type { BondTurnResult } from "@/lib/turn/bondTurn";
import type { TurnPhaseTelemetryMap } from "@/lib/db/types";
import type { CorporationTurnResult } from "@/lib/turn/corporation/corporationTurnRuntime";
import { ZOD_CURRENCY_ENUM, type CurrencyCode } from "@/lib/constants/currencies";
import { LEGACY_PHASE_GROUPS, type LegacyPhaseGroup } from "./legacyPhaseNames";

/** Country-keyed maps stay far below this; anything larger is not a bond flow. */
const MAX_FLOW_KEYS = 256;
const MAX_KEY_LENGTH = 64;

const BOND_COUNTS = [
  "bondsProcessed",
  "couponsPaid",
  "bondsMatured",
  "bondsDefaulted",
  "totalCouponsPaid",
  "bondHistorySnapshots",
  "bondsAutoRestructured",
  "bondsAutoRefinanced",
] as const;

const BOND_FLOWS = [
  "sovereignCashProceedsByCountry",
  "sovereignDebtFaceIssuedByCountry",
  "sovereignCouponPaidByCountry",
  "sovereignMaturityCashPaidByCountry",
  "sovereignDebtFaceRetiredByCountry",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedFlow(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_FLOW_KEYS) return null;
  const out: Record<string, number> = {};
  for (const [key, amount] of entries) {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) return null;
    if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
    out[key] = amount;
  }
  return out;
}

/** Bounded plain-object copy of a valid BondTurnResult, for gameState. */
function encodeBondTurnResult(result: unknown): Record<string, unknown> | null {
  const decoded = decodeBondTurnResult(result);
  if (!decoded) return null;
  const out: Record<string, unknown> = {};
  for (const key of BOND_COUNTS) out[key] = decoded[key];
  for (const key of BOND_FLOWS) {
    const flow = decoded[key];
    if (flow) out[key] = { ...flow };
  }
  return out;
}

/**
 * V2 treasury cash settles from all five sovereign flow maps. A result without
 * every one of them (capture off, or a truncated stored copy) cannot feed it:
 * an absent map is unknown, not zero. Non-V2 results legitimately omit them.
 */
export function hasCompleteSovereignFlows(result: BondTurnResult): boolean {
  return BOND_FLOWS.every((key) => boundedFlow(result[key]) !== null);
}

/** Narrow a fresh or persisted value to an exact BondTurnResult, or null. */
function decodeBondTurnResult(raw: unknown): BondTurnResult | null {
  if (!isRecord(raw)) return null;
  const out: Partial<BondTurnResult> = {};
  for (const key of BOND_COUNTS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    out[key] = value;
  }
  for (const key of BOND_FLOWS) {
    if (raw[key] === undefined) continue;
    const flow = boundedFlow(raw[key]);
    if (!flow) return null;
    out[key] = flow;
  }
  return out as BondTurnResult;
}

const CORPORATION_COUNTS = [
  "corporationsProcessed",
  "sectorsProcessed",
  "totalRevenueGenerated",
  "totalIncomeGenerated",
] as const;

/** Bounded income maps, stored as entries so Mongo never receives Map instances. */
function decodeCorporationTurnResult(raw: unknown): CorporationTurnResult | null {
  if (!isRecord(raw)) return null;
  if (CORPORATION_COUNTS.some((key) => typeof raw[key] !== "number" || !Number.isFinite(raw[key])))
    return null;
  const warnings = raw.turnWarnings;
  if (
    !Array.isArray(warnings) ||
    warnings.length > 10000 ||
    warnings.some((w) => typeof w !== "string" || w.length > 4096)
  )
    return null;
  const entries = (value: unknown): unknown[] | null =>
    value instanceof Map ? [...value] : Array.isArray(value) ? value : null;
  const internal = entries(raw.currencyIncomeInternalByCharacterId);
  const face = entries(raw.currencyIncomeFaceByCharacterId);
  if (!internal || !face || internal.length > 10000 || face.length > 10000) return null;
  const amounts = new Map<string, number>();
  const currencies = new Map<string, Map<CurrencyCode, number>>();
  const validKey = (key: unknown): key is string =>
    typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LENGTH;
  const validAmount = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;
  for (const row of internal) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      !validKey(row[0]) ||
      !validAmount(row[1]) ||
      amounts.has(row[0])
    )
      return null;
    amounts.set(row[0], row[1]);
  }
  for (const row of face) {
    if (!Array.isArray(row) || row.length !== 2 || !validKey(row[0]) || currencies.has(row[0]))
      return null;
    const values = entries(row[1]);
    if (!values || values.length > ZOD_CURRENCY_ENUM.length) return null;
    const byCurrency = new Map<CurrencyCode, number>();
    for (const value of values) {
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        !ZOD_CURRENCY_ENUM.includes(value[0]) ||
        !validAmount(value[1]) ||
        byCurrency.has(value[0])
      )
        return null;
      byCurrency.set(value[0], value[1]);
    }
    currencies.set(row[0], byCurrency);
  }
  return {
    corporationsProcessed: raw.corporationsProcessed as number,
    sectorsProcessed: raw.sectorsProcessed as number,
    totalRevenueGenerated: raw.totalRevenueGenerated as number,
    totalIncomeGenerated: raw.totalIncomeGenerated as number,
    turnWarnings: [...warnings],
    currencyIncomeInternalByCharacterId: amounts,
    currencyIncomeFaceByCharacterId: currencies,
  };
}

function encodeCorporationTurnResult(raw: unknown): Record<string, unknown> | null {
  const result = decodeCorporationTurnResult(raw);
  if (!result) return null;
  const stored = {
    ...result,
    currencyIncomeInternalByCharacterId: [...result.currencyIncomeInternalByCharacterId],
    currencyIncomeFaceByCharacterId: [...result.currencyIncomeFaceByCharacterId].map(
      ([id, amounts]) => [id, [...amounts]]
    ),
  };
  // Keep the completion snapshot well below Mongo's document limit even with long warnings.
  return JSON.stringify(stored).length <= 2_000_000 ? stored : null;
}

interface ResumeResultCodec {
  /** Bounded persistable copy of a fresh result; null when it cannot be kept. */
  encode(result: unknown): Record<string, unknown> | null;
  /** Exact restored result, or null when the stored copy is missing or malformed. */
  decode(raw: unknown): unknown;
}

const CODECS: Record<string, ResumeResultCodec> = {
  bondTurn: { encode: encodeBondTurnResult, decode: decodeBondTurnResult },
  corporationTurn: { encode: encodeCorporationTurnResult, decode: decodeCorporationTurnResult },
};

export function phaseRequiresResumeResult(name: string): boolean {
  return Object.hasOwn(CODECS, name);
}

export function encodeResumeResult(name: string, result: unknown): Record<string, unknown> | null {
  return CODECS[name]?.encode(result) ?? null;
}

/**
 * How a dead holder left each phase. `completed` phases committed in full;
 * `interrupted` ones were mid-flight and may have committed part of their writes.
 * Neither may run again. Only a completed phase with a valid stored result can
 * hand that result to a dependent phase.
 */
/**
 * Whether a dead holder's marker means the phase applied writes. A resumed
 * holder records inherited phases as skipped and carries their state forward.
 * A skip from a release before that carry existed (`upstreamAbort` with no
 * `resumeCarried`) proves the phase applied but not that it finished, so it is
 * treated as interrupted: never rerun, never a source of a result. A `failed`
 * phase may have written part of its work, so it is interrupted too, unless it
 * failed with TurnMustStopError: such a phase is re-entrant by contract (its
 * money moves replay by key), the turn stopped on it, and the resume reruns it.
 */
function appliedState(
  telemetry: TurnPhaseTelemetryMap[string] | null | undefined
): "completed" | "interrupted" | null {
  switch (telemetry?.status) {
    case "completed":
      return "completed";
    case "running":
      return "interrupted";
    case "failed":
      return telemetry.reason === "mustStop" ? null : "interrupted";
    case "skipped":
      if (telemetry.resumeCarried) return telemetry.resumeCarried;
      return telemetry.reason === "upstreamAbort" ? "interrupted" : null;
    default:
      return null;
  }
}

/**
 * Phases a crash resume must never pass over while interrupted. Their output is
 * the economy itself: `corporationTurn` settles the funded producer market and
 * every plant's profit, and `commodityPrices`, `lineOfCreditTurn` and the
 * treasury read what it settled. An interrupted run may have committed any
 * prefix of its writes (the funded settlement is journaled and replays by key,
 * but the legacy tail still has unkeyed increments and inserts), so it cannot be
 * proven safe to rerun, and skipping it completes the turn with the economy
 * missing (turn 736). The resume refuses instead and holds the turn for repair.
 * A phase that failed with TurnMustStopError is not interrupted by this
 * definition: it stopped before the unkeyed writes and reruns by contract.
 */
const RESUME_BLOCKING_WHEN_INTERRUPTED: ReadonlySet<string> = new Set(["corporationTurn"]);

export function phaseBlocksResumeWhenInterrupted(name: string): boolean {
  return RESUME_BLOCKING_WHEN_INTERRUPTED.has(name);
}

/** Recorded on an interrupted phase the resume does not rerun. */
export const INTERRUPTED_PHASE_NOT_RERUN_MESSAGE =
  "interrupted by a crash before it finished; not rerun, so its work for this turn may be missing or partial";

/**
 * How a turn recorded by an older build left a renamed or merged phase. Only
 * that build's record lacks the current name, since this build records every
 * phase from the start. Any applied member means the work already ran at least
 * in part, so the phase is never rerun: completed when every applied member
 * finished, interrupted otherwise. Members not yet reached wait a turn rather
 * than risk running twice.
 */
export function legacyGroupState(
  group: LegacyPhaseGroup,
  statuses: TurnPhaseTelemetryMap | null | undefined,
  completed: ReadonlySet<string>,
  interrupted: ReadonlySet<string>
): "completed" | "interrupted" | null {
  if (!statuses || Object.hasOwn(statuses, group.current)) return null;
  if (group.legacy.some((name) => interrupted.has(name))) return "interrupted";
  return group.legacy.some((name) => completed.has(name)) ? "completed" : null;
}

export interface CrashedTurnPhaseState {
  completed: Set<string>;
  interrupted: Set<string>;
  results: Record<string, unknown>;
}

export function readCrashedTurnPhaseState(
  statuses: TurnPhaseTelemetryMap | null | undefined,
  rawResults: unknown
): CrashedTurnPhaseState {
  const completed = new Set<string>();
  const interrupted = new Set<string>();
  for (const [phase, telemetry] of Object.entries(statuses ?? {})) {
    const state = appliedState(telemetry);
    if (state === "completed") completed.add(phase);
    else if (state === "interrupted") interrupted.add(phase);
  }
  for (const group of LEGACY_PHASE_GROUPS) {
    const state = legacyGroupState(group, statuses, completed, interrupted);
    if (state === "completed") completed.add(group.current);
    else if (state === "interrupted") interrupted.add(group.current);
  }
  const results: Record<string, unknown> = {};
  const stored = isRecord(rawResults) ? rawResults : {};
  for (const phase of completed) {
    if (!phaseRequiresResumeResult(phase)) continue;
    const decoded = CODECS[phase]!.decode(stored[phase]);
    if (decoded !== null) results[phase] = decoded;
  }
  return { completed, interrupted, results };
}

export type ResumeResultOutcome = "restored" | "missing" | "interrupted";

/**
 * A result-carrying phase committed its writes but its completed marker and
 * result could not be stored together. The turn must stop: continuing would
 * leave a later status flush able to record the phase completed with no result.
 */
export class TurnPhaseCompletionPersistError extends Error {
  constructor(
    readonly phase: string,
    cause: unknown
  ) {
    super(
      `${phase} committed its writes but its completion result could not be stored; ` +
        `the turn stops so a resume treats it as interrupted.`,
      { cause }
    );
    this.name = "TurnPhaseCompletionPersistError";
  }
}

/** A validated resume no longer matches the turn setup is about to run. */
export class TurnResumeRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnResumeRefusedError";
  }
}

/** Errors after which the turn keeps its lock and evidence instead of releasing. */
export function isResumeFailClosedError(err: unknown): boolean {
  return (
    err instanceof TurnResumeResultUnavailableError ||
    err instanceof TurnPhaseCompletionPersistError ||
    err instanceof TurnResumeRefusedError ||
    err instanceof TurnPhaseResultIncompleteError
  );
}

/** A phase result exists but lacks fields its dependent requires. */
export class TurnPhaseResultIncompleteError extends Error {
  constructor(
    readonly phase: string,
    readonly dependent: string,
    detail: string
  ) {
    super(
      `${dependent} cannot run: the ${phase} result is incomplete (${detail}). ` +
        `No missing flow is assumed to be zero. Repair required before this turn can finish.`
    );
    this.name = "TurnPhaseResultIncompleteError";
  }
}

export class TurnResumeResultUnavailableError extends Error {
  constructor(
    readonly phase: string,
    readonly outcome: Exclude<ResumeResultOutcome, "restored">,
    readonly dependent: string
  ) {
    super(
      outcome === "interrupted"
        ? `Crash resume cannot run ${dependent}: ${phase} was interrupted mid-phase, so its ` +
            `committed flows are unknown. It will not be rerun. Repair required before this turn can finish.`
        : `Crash resume cannot run ${dependent}: ${phase} completed before the crash but no ` +
            `valid stored result exists. It will not be rerun and no zero flow is assumed. ` +
            `Repair required before this turn can finish.`
    );
    this.name = "TurnResumeResultUnavailableError";
  }
}
