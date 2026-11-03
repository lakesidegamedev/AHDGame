/**
 * Autonomous NPP index-fund redemptions (issue #2120).
 *
 * Before this module the ONLY caller of `enqueueRedemption` was the player
 * redeem route, so the NPP branch of `processQueuedRedemptions` in
 * `fundCron.ts` was unreachable in a running world and the full
 * subscribe -> rebalance -> redeem round trip had never happened.
 *
 * This adds a *gated* autonomous redemption policy: when
 * `gameConfig.nppFundRedemptionEnabled === true`, the NPP investing pass may
 * redeem a bounded fraction of an overweight position through the SAME
 * `enqueueRedemption` path the player route uses, so the cron pays it out on a
 * later turn. The policy has three hard properties:
 *
 *   1. Strictly bounded per turn — a single position can give up at most
 *      `NPP_FUND_REDEMPTION_MAX_FRACTION_PER_TURN` of its units in one pass.
 *   2. Never removes more units than held — the position debit is the atomic,
 *      balance-gated `debitFundPosition` guard; a failed debit skips the entry.
 *   3. Deterministic — the planner is pure and orders positions by value then
 *      by fund id, so identical inputs produce identical intents.
 *
 * When the flag is absent or false the pass performs a single config read and
 * returns zero with NO writes, so the NPP investing pass is byte-identical to
 * its pre-flag behavior.
 */

import { ObjectId, type ClientSession, type Db } from "mongodb";
import type {
  GameConfig,
  IndexFund,
  IndexFundPosition,
  IndexFundRedemptionQueueEntry,
  IndexFundTransaction,
} from "@/lib/db/types";
import { assertTransactionSupportAtBoot } from "@/lib/db/transactionSupport";
import {
  FUND_COLLECTION,
  FUND_POSITION_COLLECTION,
  FUND_REDEMPTION_QUEUE_COLLECTION,
  FUND_TRANSACTION_COLLECTION,
  creditFundPosition,
  debitFundPosition,
  enqueueRedemption,
  insertFundTransaction,
} from "@/lib/indexFunds/fundQueries";
import { boundedParallelMap } from "@/lib/indexFunds/boundedParallelMap";

/** Mirrors `NPRiskArchetype` in nppInvesting.ts (kept local to avoid an import cycle). */
export type NppRiskArchetype = "conservative" | "moderate" | "aggressive";

/**
 * Hard per-turn cap on how much of a single position an autonomous NPP may
 * redeem. Small enough that a position decays toward target over many turns
 * rather than being dumped in one pass.
 */
export const NPP_FUND_REDEMPTION_MAX_FRACTION_PER_TURN = 0.1;

/**
 * Archetype target share of total investment wealth (cash + fund value) that
 * the NPP wants to hold in fund units. When the realized fund share runs above
 * this, the excess is the redemption budget for the turn. Conservative NPPs
 * hold proportionally more cash, aggressive ones more funds.
 */
export const NPP_ARCHETYPE_TARGET_FUND_SHARE: Record<NppRiskArchetype, number> = {
  conservative: 0.55,
  moderate: 0.65,
  aggressive: 0.75,
};

/** Archetype's target fund share of total investment wealth. */
export function nppTargetFundShare(archetype: NppRiskArchetype): number {
  return NPP_ARCHETYPE_TARGET_FUND_SHARE[archetype];
}

/** One NPP's fund position as the planner sees it. */
export type NppHeldFundPosition = {
  fundId: ObjectId;
  units: number;
  /** Fund NAV used to value the position this pass. */
  quotedNav: number;
};

/** A planned redemption: `units` of `fundId` to queue for the cron to pay. */
export type NppRedemptionIntent = {
  fundId: ObjectId;
  units: number;
};

/**
 * Pure, deterministic redemption planner. Returns the whole units of each fund
 * an NPP should queue this pass to walk its fund share back toward its
 * archetype target.
 *
 * Bounds, all of which make the result safe to hand straight to the guarded
 * debit: each position contributes at most
 * `floor(units * NPP_FUND_REDEMPTION_MAX_FRACTION_PER_TURN)` units, never more
 * than it holds, and the running total never exceeds the overweight value.
 */
export function planNppFundRedemptions(input: {
  archetype: NppRiskArchetype;
  cashAnchor: number;
  positions: NppHeldFundPosition[];
}): NppRedemptionIntent[] {
  const positions = input.positions.filter(
    (p) =>
      Number.isFinite(p.units) && p.units >= 1 && Number.isFinite(p.quotedNav) && p.quotedNav > 0
  );
  if (positions.length === 0) return [];

  const cashAnchor = Number.isFinite(input.cashAnchor) ? Math.max(0, input.cashAnchor) : 0;
  const fundValueAnchor = positions.reduce((sum, p) => sum + Math.floor(p.units) * p.quotedNav, 0);
  const totalWealthAnchor = cashAnchor + fundValueAnchor;
  if (totalWealthAnchor <= 0 || fundValueAnchor <= 0) return [];

  const targetFundValueAnchor = nppTargetFundShare(input.archetype) * totalWealthAnchor;
  let remainingExcessAnchor = fundValueAnchor - targetFundValueAnchor;
  if (remainingExcessAnchor <= 0) return [];

  // Deterministic order: largest position value first, ties broken by fund id so
  // the same portfolio always yields the same plan.
  const ordered = [...positions].sort((a, b) => {
    const av = Math.floor(a.units) * a.quotedNav;
    const bv = Math.floor(b.units) * b.quotedNav;
    if (bv !== av) return bv - av;
    return a.fundId.toString().localeCompare(b.fundId.toString());
  });

  const intents: NppRedemptionIntent[] = [];
  for (const position of ordered) {
    if (remainingExcessAnchor <= 0) break;
    const heldUnits = Math.max(0, Math.floor(position.units));
    const fractionCap = Math.floor(heldUnits * NPP_FUND_REDEMPTION_MAX_FRACTION_PER_TURN);
    if (fractionCap <= 0) continue;
    const excessUnits = Math.floor(remainingExcessAnchor / position.quotedNav);
    const units = Math.min(fractionCap, excessUnits, heldUnits);
    if (units <= 0) continue;
    intents.push({ fundId: position.fundId, units });
    remainingExcessAnchor -= units * position.quotedNav;
  }
  return intents;
}

export type NppRedemptionPassResult = {
  redemptionsQueued: number;
  unitsRedeemed: number;
  errors: string[];
};

/**
 * Execute the autonomous redemption policy for every NPP that holds fund units.
 *
 * Gated on `gameConfig.nppFundRedemptionEnabled === true`. Off/absent is a
 * read-only no-op so the calling pass stays byte-identical. Each queued
 * redemption debits the NPP position and burns fund unit supply at request
 * time (exactly like the player route), so the cron's `processQueuedRedemptions`
 * only has to pay cash and can never leave an orphan position behind.
 */
/** NPPs whose redemption intents run at once; each NPP's intents stay in order. */
export const NPP_REDEMPTION_CONCURRENCY = 16;

export async function processNppFundRedemptions(
  db: Db,
  options: {
    currentTurn: number;
    /** Funds loaded by the calling pass; supplies `quotedNav`/`unitSupply`. */
    activeFunds: IndexFund[];
    /** Archetype per NPP id, from the investing pass's roster (no extra read). */
    archetypesByNppId: ReadonlyMap<string, NppRiskArchetype>;
  }
): Promise<NppRedemptionPassResult> {
  const config = await db
    .collection<GameConfig>("gameConfig")
    .findOne({ _id: "default" }, { projection: { nppFundRedemptionEnabled: 1 } });
  if (config?.nppFundRedemptionEnabled !== true || options.currentTurn <= 0) {
    return { redemptionsQueued: 0, unitsRedeemed: 0, errors: [] };
  }

  const errors: string[] = [];
  let redemptionsQueued = 0;
  let unitsRedeemed = 0;

  const fundById = new Map(options.activeFunds.map((fund) => [fund._id.toString(), fund]));

  const positions = await db
    .collection<IndexFundPosition>(FUND_POSITION_COLLECTION)
    .find({ holderKind: "npp" }, { projection: { nppId: 1, fundId: 1, units: 1 } })
    .toArray();

  const positionsByNppId = new Map<string, IndexFundPosition[]>();
  for (const position of positions) {
    if (!position.nppId) continue;
    const key = position.nppId.toString();
    const list = positionsByNppId.get(key);
    if (list) list.push(position);
    else positionsByNppId.set(key, [position]);
  }

  const candidateNppIds = [...positionsByNppId.keys()]
    .filter((id) => options.archetypesByNppId.has(id))
    .map((id) => new ObjectId(id))
    .sort((a, b) => a.toString().localeCompare(b.toString()));
  if (candidateNppIds.length === 0) {
    return { redemptionsQueued: 0, unitsRedeemed: 0, errors };
  }

  const cashByNppId = new Map<string, number>();
  const cashDocs = await db
    .collection<{ _id: ObjectId; nppInvestmentCashAnchor?: number }>("npps")
    .find({ _id: { $in: candidateNppIds } }, { projection: { nppInvestmentCashAnchor: 1 } })
    .toArray();
  for (const doc of cashDocs) cashByNppId.set(doc._id.toString(), doc.nppInvestmentCashAnchor ?? 0);

  // Plan every intent up front. The planner is pure, so this is the same set
  // of intents, in the same per-NPP order, the lanes below used to plan inline.
  const now = new Date();
  const planned: PlannedNppRedemption[] = [];
  for (const nppId of candidateNppIds) {
    const nppKey = nppId.toString();
    const archetype = options.archetypesByNppId.get(nppKey);
    if (!archetype) continue;

    const heldPositions: NppHeldFundPosition[] = [];
    for (const position of positionsByNppId.get(nppKey) ?? []) {
      const fund = fundById.get(String(position.fundId));
      if (!fund || !Number.isFinite(fund.quotedNav) || fund.quotedNav <= 0) continue;
      heldPositions.push({
        fundId: position.fundId,
        units: position.units ?? 0,
        quotedNav: fund.quotedNav,
      });
    }

    const intents = planNppFundRedemptions({
      archetype,
      cashAnchor: cashByNppId.get(nppKey) ?? 0,
      positions: heldPositions,
    });
    for (const intent of intents) {
      const fund = fundById.get(intent.fundId.toString());
      if (fund) planned.push({ nppId, intent, quotedNav: fund.quotedNav });
    }
  }
  if (planned.length === 0) return { redemptionsQueued, unitsRedeemed, errors };

  // Fast path: every intent in one transaction, one bulk write per collection.
  // It commits only when every guard the per-intent path checks would pass, so
  // the end state is the one the per-intent path reaches when nothing skips.
  // Any miss aborts the whole batch and the per-intent path below runs instead.
  const batched = await applyNppRedemptionsAtomically(db, planned, now);
  if (batched.status === "applied") {
    for (const p of planned) unitsRedeemed += p.intent.units;
    return { redemptionsQueued: planned.length, unitsRedeemed, errors };
  }
  if (batched.status === "failed") {
    // The commit may or may not have landed, so re-running could redeem twice.
    // The intents are re-planned from fresh positions on the next pass.
    errors.push(`NPP redemptions batch: ${batched.message}`);
    return { redemptionsQueued, unitsRedeemed, errors };
  }

  const sequential = await applyNppRedemptionsSequentially(db, planned, now);
  redemptionsQueued += sequential.redemptionsQueued;
  unitsRedeemed += sequential.unitsRedeemed;
  errors.push(...sequential.errors);
  return { redemptionsQueued, unitsRedeemed, errors };
}

export type PlannedNppRedemption = {
  nppId: ObjectId;
  intent: NppRedemptionIntent;
  quotedNav: number;
};

/** Thrown inside the batch transaction when a guard misses, to abort it. */
class NppRedemptionGuardMiss extends Error {}

type AtomicOutcome =
  { status: "applied" } | { status: "unavailable" } | { status: "failed"; message: string };

async function applyNppRedemptionsAtomically(
  db: Db,
  planned: PlannedNppRedemption[],
  now: Date
): Promise<AtomicOutcome> {
  const client = (db as { client?: { startSession?: () => ClientSession } }).client;
  if (typeof client?.startSession !== "function") return { status: "unavailable" };
  let supported = false;
  try {
    supported = await assertTransactionSupportAtBoot();
  } catch {
    supported = false;
  }
  if (!supported) return { status: "unavailable" };

  const session = client.startSession();
  try {
    await session.withTransaction(() => writeNppRedemptionBatch(db, planned, now, session));
    return { status: "applied" };
  } catch (err) {
    if (err instanceof NppRedemptionGuardMiss) return { status: "unavailable" };
    return { status: "failed", message: err instanceof Error ? err.message : String(err) };
  } finally {
    await session.endSession();
  }
}

/**
 * The writes of every planned redemption as one bulk call per collection, in
 * the order the per-intent path issues them. Throws NppRedemptionGuardMiss when
 * any position debit or supply burn would have been skipped, so the caller's
 * transaction rolls the batch back. Exported for the equivalence test.
 */
export async function writeNppRedemptionBatch(
  db: Db,
  planned: PlannedNppRedemption[],
  now: Date,
  session?: ClientSession
): Promise<void> {
  const opts = session ? { session } : {};
  const identity = (p: PlannedNppRedemption) => ({
    fundId: p.intent.fundId,
    holderKind: "npp" as const,
    nppId: p.nppId,
  });

  // Same balance-gated pipeline debit as debitFundPosition, in intent order,
  // stamped with the clock at the debit as debitFundPosition stamps it.
  const debitedAt = new Date();
  const debit = await db.collection(FUND_POSITION_COLLECTION).bulkWrite(
    planned.map((p) => ({
      updateOne: {
        filter: { ...identity(p), units: { $gte: p.intent.units } },
        update: [
          {
            $set: {
              units: { $subtract: ["$units", p.intent.units] },
              legacyUnits: {
                $max: [0, { $subtract: [{ $ifNull: ["$legacyUnits", "$units"] }, p.intent.units] }],
              },
              updatedAt: debitedAt,
            },
          },
        ],
      },
    })),
    { ordered: true, ...opts }
  );
  if (debit.matchedCount !== planned.length) throw new NppRedemptionGuardMiss();

  // debitFundPosition removes a position the debit took to zero.
  await db.collection(FUND_POSITION_COLLECTION).bulkWrite(
    planned.map((p) => ({ deleteOne: { filter: { ...identity(p), units: { $lte: 0 } } } })),
    { ordered: true, ...opts }
  );

  // Guarded supply burn per intent, as the per-intent path does it.
  const burn = await db.collection<IndexFund>(FUND_COLLECTION).bulkWrite(
    planned.map((p) => ({
      updateOne: {
        filter: { _id: p.intent.fundId, unitSupply: { $gte: p.intent.units } },
        update: { $inc: { unitSupply: -p.intent.units }, $set: { updatedAt: now } },
      },
    })),
    { ordered: true, ...opts }
  );
  if (burn.matchedCount !== planned.length) throw new NppRedemptionGuardMiss();

  await db.collection<IndexFundRedemptionQueueEntry>(FUND_REDEMPTION_QUEUE_COLLECTION).insertMany(
    planned.map((p) => queueEntryFor(p, now) as IndexFundRedemptionQueueEntry),
    { ordered: true, ...opts }
  );
  await db.collection<IndexFundTransaction>(FUND_TRANSACTION_COLLECTION).insertMany(
    planned.map((p) => queuedTransactionFor(p, now) as IndexFundTransaction),
    { ordered: true, ...opts }
  );
}

function queueEntryFor(
  p: PlannedNppRedemption,
  now: Date
): Omit<IndexFundRedemptionQueueEntry, "_id"> {
  return {
    fundId: p.intent.fundId,
    holderKind: "npp",
    nppId: p.nppId,
    units: p.intent.units,
    requestedNavAnchor: p.quotedNav,
    requestedAmountAnchor: p.intent.units * p.quotedNav,
    paidAmountAnchor: 0,
    unitsBurnedAtRequest: true,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
}

function queuedTransactionFor(
  p: PlannedNppRedemption,
  now: Date
): Omit<IndexFundTransaction, "_id"> {
  return {
    fundId: p.intent.fundId,
    kind: "redemption_queued",
    holderKind: "npp",
    nppId: p.nppId,
    units: p.intent.units,
    navAnchor: p.quotedNav,
    amountAnchor: p.intent.units * p.quotedNav,
    note: "NPP autonomous rebalance redemption queued",
    createdAt: now,
  };
}

/**
 * The per-intent path: each debit and burn is its own guarded write, so a
 * miss skips only that intent. Used on standalone Mongo and whenever the
 * batch would have skipped something. Exported for the equivalence test.
 */
export async function applyNppRedemptionsSequentially(
  db: Db,
  planned: PlannedNppRedemption[],
  now: Date
): Promise<NppRedemptionPassResult> {
  let redemptionsQueued = 0;
  let unitsRedeemed = 0;
  const byNpp = new Map<string, PlannedNppRedemption[]>();
  for (const p of planned) {
    const key = p.nppId.toString();
    const list = byNpp.get(key);
    if (list) list.push(p);
    else byNpp.set(key, [p]);
  }
  // NPPs are independent: each owns its positions, the fund supply burn is an
  // atomic guarded increment, and the queue and transaction rows are inserts.
  // Running NPPs in bounded lanes keeps every intent's writes in their
  // original order and only overlaps the round trips of different NPPs.
  const perNppErrors = await boundedParallelMap(
    [...byNpp.values()],
    NPP_REDEMPTION_CONCURRENCY,
    async (items): Promise<string[]> => {
      const nppErrors: string[] = [];
      for (const p of items) {
        const { nppId, intent } = p;
        try {
          // Atomic, balance-gated debit: the sole guarantee that we never remove
          // more units than the NPP holds. A failed debit means a concurrent
          // change drained the position — skip rather than over-redeem.
          const debit = await debitFundPosition(db, intent.fundId, "npp", { nppId }, intent.units);
          if (!debit.ok) continue;

          // Burn the redeemed units from fund supply at request time, mirroring
          // the player route; the cron then only pays cash. Guarded; if supply
          // moved under us, restore the position and skip.
          const burn = await db
            .collection<IndexFund>(FUND_COLLECTION)
            .updateOne(
              { _id: intent.fundId, unitSupply: { $gte: intent.units } },
              { $inc: { unitSupply: -intent.units }, $set: { updatedAt: now } }
            );
          if (burn.matchedCount === 0) {
            await creditFundPosition(
              db,
              intent.fundId,
              "npp",
              { nppId },
              intent.units,
              p.quotedNav
            );
            continue;
          }

          await enqueueRedemption(db, queueEntryFor(p, now));
          await insertFundTransaction(db, queuedTransactionFor(p, now));

          redemptionsQueued++;
          unitsRedeemed += intent.units;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          nppErrors.push(`NPP ${nppId.toString()} redemption: ${message}`);
        }
      }
      return nppErrors;
    }
  );
  return { redemptionsQueued, unitsRedeemed, errors: perNppErrors.flat() };
}
