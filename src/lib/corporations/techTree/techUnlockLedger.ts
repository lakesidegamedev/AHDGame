import * as Sentry from "@sentry/nextjs";
import type { Db, ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { sumStrengthGrants, type TechTreeNode } from "@/lib/constants/techTree";
import type { ActionAuditInput } from "@/lib/db/types";
import { emitTxStrict, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";
import { frontierResearchInc } from "./frontierResearch";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

/**
 * Finance-history ledger rows for sector tech-tree unlocks.
 *
 * Both unlock paths (player command `unlockTechNode.ts`, NPP bulkWrite in
 * `corpBehaviorConfig.ts`) debit `liquidCapital` via a guarded once-only write but could
 * leave the debit without a matching finance-history row, making cash losses invisible.
 * This is the shared boundary:
 *
 * - `buildTechUnlockTxEntry` (pure) builds the debit row: negative `amount` equal to the
 *   cash cost, corp currency, turn, technology identity in `meta`.
 * - `emitTxStrict` persists with bounded retries and THROWS on persistent failure, so a
 *   committed debit is never silently invisible. Applied-but-unacknowledged inserts are
 *   adopted (verified field-by-field), not rolled back.
 * - `buildTechUnlockRefundUpdate` (pure) reverses a committed unlock for compensating
 *   refund when the ledger insert persistently fails.
 *
 * Ordering (both paths): the guarded cash write commits FIRST, the ledger row is emitted
 * only after the write provably applied. Rejected or raced unlocks never emit.
 *
 * Idempotency: `financialTxLog` has no unique index, so the once-only cash write IS the
 * dedupe. `meta.ledgerKey` still lets forensics match rows to unlocks.
 */

/** One intended (decision-time) tech unlock awaiting ledger flush. */
export interface TechUnlockLedgerInput {
  corporationId: ObjectId;
  corporationName: string;
  corporationSequentialId?: number;
  nodeId: string;
  nodeName: string;
  decadeId: string;
  lane: string;
  slot: number;
  /** rdScore price of the node (for forensics; the wallet spend is not cash). */
  rdCost: number;
  /** Exact cash debited from `liquidCapital`, in `currencyCode`. */
  cashCost: number;
  currencyCode: CurrencyCode;
  turn: number;
  createdAt: Date;
  /** `unlockedTechNodeIds` snapshot taken before the cash write applied. */
  alreadyOwned: string[];
  /** One-time strength grants applied alongside the debit (refund reverses). */
  marketingGrant?: number;
  logisticsGrant?: number;
  /** True when this unlock created the decade lane commitment. */
  committing?: boolean;
}

/** Stable cross-reference stamped on the row so forensics can match it back. */
export function techUnlockLedgerKey(corporationId: ObjectId, nodeId: string, turn: number): string {
  return `tech-unlock:${corporationId.toString()}:${nodeId}:t${turn}`;
}

/**
 * Build the finance-history debit row for one committed unlock. Pure — no DB
 * access — so both the player command and the turn flush share it exactly.
 * `anchorAmount` is deliberately omitted: the emit path derives it from the
 * live FX table, the same convention every other corp emitter uses.
 */
export function buildTechUnlockTxEntry(input: TechUnlockLedgerInput): TxInput {
  return {
    type: "corp_tech_unlock",
    turn: input.turn,
    createdAt: input.createdAt,
    subjectType: "corporation",
    subjectId: input.corporationId,
    subjectName: input.corporationName,
    ...(input.corporationSequentialId !== undefined
      ? { subjectSequentialId: input.corporationSequentialId }
      : {}),
    amount: -input.cashCost,
    currencyCode: input.currencyCode,
    meta: {
      ledgerKey: techUnlockLedgerKey(input.corporationId, input.nodeId, input.turn),
      nodeId: input.nodeId,
      nodeName: input.nodeName,
      decadeId: input.decadeId,
      lane: input.lane,
      slot: input.slot,
      rdCost: input.rdCost,
    },
  };
}

export interface TechUnlockRefundSpec {
  nodeId: string;
  decadeId: string;
  rdCost: number;
  cashCost: number;
  marketingGrant?: number;
  logisticsGrant?: number;
  committing?: boolean;
}

/**
 * Build the compensating update that fully reverses one committed unlock:
 * cash and rdScore restored, node removed, decade lane commitment undone only
 * when this unlock created it. Pure — the caller supplies the `_id` filter.
 */
export function buildTechUnlockRefundUpdate(spec: TechUnlockRefundSpec): {
  $inc: Record<string, number>;
  $pull: { unlockedTechNodeIds: string };
  $unset?: Record<string, "">;
  $set: { updatedAt: Date };
} {
  const $inc: Record<string, number> = {
    rdScore: spec.rdCost,
    liquidCapital: spec.cashCost,
  };
  if ((spec.marketingGrant ?? 0) > 0) $inc.marketingStrength = -(spec.marketingGrant ?? 0);
  if ((spec.logisticsGrant ?? 0) > 0) $inc.logisticsStrength = -(spec.logisticsGrant ?? 0);
  for (const [field, amount] of Object.entries(frontierResearchInc(spec.decadeId, spec.rdCost))) {
    $inc[field] = -amount;
  }
  return {
    $inc,
    $pull: { unlockedTechNodeIds: spec.nodeId },
    ...(spec.committing
      ? {
          $unset: {
            [`techDecadeLane.${spec.decadeId}`]: "",
            [`techDecadeChosenTurn.${spec.decadeId}`]: "",
          } as Record<string, "">,
        }
      : {}),
    $set: { updatedAt: new Date() },
  };
}

/** Refund spec for a node object, deriving the one-time grants from effects. */
export function refundSpecForNode(
  node: TechTreeNode,
  cashCost: number,
  committing: boolean
): TechUnlockRefundSpec {
  const grants = sumStrengthGrants(node.effects);
  return {
    nodeId: node.id,
    decadeId: node.decadeId,
    rdCost: node.cost,
    cashCost,
    marketingGrant: grants.marketingStrength,
    logisticsGrant: grants.logisticsStrength,
    committing,
  };
}

export interface TechUnlockFlushResult {
  attempted: number;
  emitted: number;
  skippedUncommitted: number;
  skippedDuplicate: number;
  refunded: number;
}

/** Build the exceptional turn-audit row without bloating the turn orchestrator. */
export function buildTechUnlockFlushAudit(result: TechUnlockFlushResult): ActionAuditInput | null {
  if (result.refunded === 0 && result.emitted === result.attempted) return null;
  return {
    source: "turn",
    category: "corp",
    action: "corp.tech_unlock_ledger",
    phase: "corporationTurn",
    subject: { type: "corpBatch", name: "npp tech-unlock ledger" },
    outcome: result.refunded > 0 ? "error" : "ok",
    meta: {
      attempted: result.attempted,
      emitted: result.emitted,
      skippedUncommitted: result.skippedUncommitted,
      skippedDuplicate: result.skippedDuplicate,
      refunded: result.refunded,
    },
  };
}

/*
 * Flush NPP tech-unlock ledger rows AFTER the corporation bulkWrite applied.
 *
 * Only unlocks verified against the post-write snapshot produce a row: the
 * node must be absent from the decision-time snapshot and present now, which
 * proves this turn's guarded op committed it. Concurrent manual unlocks that
 * won instead are the manual path's row to write. Rows already present for the
 * same (corp, node, turn) are skipped, never duplicated.
 *
 * A persistently failing insert triggers the compensating refund, counted in
 * `refunded`, so a debited corp never keeps an invisible debit. Read failures
 * are reported via Sentry and returned as zero-emit; the cash writes stay
 * intact because re-running the turn re-enters this flush idempotently.
 */
export async function flushNppTechUnlockLedger(
  db: Db,
  intended: TechUnlockLedgerInput[]
): Promise<TechUnlockFlushResult> {
  const result: TechUnlockFlushResult = {
    attempted: intended.length,
    emitted: 0,
    skippedUncommitted: 0,
    skippedDuplicate: 0,
    refunded: 0,
  };
  if (intended.length === 0) return result;

  try {
    const corpIds = [...new Set(intended.map((e) => e.corporationId.toString()))].map(
      (id) => intended.find((e) => e.corporationId.toString() === id)!.corporationId
    );
    const posts = await corporationsCollection(db)
      .find({ _id: { $in: corpIds } }, { projection: { unlockedTechNodeIds: 1 } })
      .toArray();
    const postOwnedByCorp = new Map(
      posts.map((c) => [c._id.toString(), new Set(c.unlockedTechNodeIds ?? [])])
    );

    const committed = intended.filter(
      (e) =>
        !e.alreadyOwned.includes(e.nodeId) &&
        (postOwnedByCorp.get(e.corporationId.toString())?.has(e.nodeId) ?? false)
    );
    result.skippedUncommitted = intended.length - committed.length;
    if (committed.length === 0) return result;

    const turns = [...new Set(committed.map((e) => e.turn))];
    const existing = await financialTxLogCollection(db)
      .find(
        {
          type: "corp_tech_unlock",
          turn: { $in: turns },
          subjectId: { $in: committed.map((e) => e.corporationId) },
        },
        { projection: { subjectId: 1, turn: 1, meta: 1 } }
      )
      .toArray();
    const existingKeys = new Set(
      existing.map((row) =>
        typeof row.meta?.ledgerKey === "string"
          ? row.meta.ledgerKey
          : techUnlockLedgerKey(row.subjectId!, (row.meta?.nodeId as string) ?? "", row.turn)
      )
    );

    const thresholds = await loadTxThresholds(db);
    for (const entry of committed) {
      if (existingKeys.has(techUnlockLedgerKey(entry.corporationId, entry.nodeId, entry.turn))) {
        result.skippedDuplicate += 1;
        continue;
      }
      try {
        await emitTxStrict(db, buildTechUnlockTxEntry(entry), { thresholds });
        result.emitted += 1;
      } catch (err) {
        Sentry.captureException(err, {
          extra: {
            phase: "flushNppTechUnlockLedger",
            corpId: entry.corporationId.toString(),
            nodeId: entry.nodeId,
            turn: entry.turn,
          },
        });
        await refundUnrecordedUnlock(db, entry);
        result.refunded += 1;
      }
    }
    return result;
  } catch (err) {
    Sentry.captureException(err, { extra: { phase: "flushNppTechUnlockLedger.read" } });
    return result;
  }
}

/**
 * Compensating refund for an unlock whose cash debit committed but whose
 * ledger row could not be persisted: restores cash + rdScore, removes the
 * node, and undoes the lane commitment only when the intent record implies
 * this unlock created it. Best-effort — failures are Sentry-visible so the
 * row can be backfilled by hand; the turn itself still completes.
 */
async function refundUnrecordedUnlock(db: Db, entry: TechUnlockLedgerInput): Promise<void> {
  try {
    await corporationsCollection(db).updateOne(
      { _id: entry.corporationId },
      buildTechUnlockRefundUpdate({
        nodeId: entry.nodeId,
        decadeId: entry.decadeId,
        rdCost: entry.rdCost,
        cashCost: entry.cashCost,
        marketingGrant: entry.marketingGrant,
        logisticsGrant: entry.logisticsGrant,
        committing: entry.committing,
      })
    );
  } catch (err) {
    Sentry.captureException(err, {
      extra: {
        phase: "refundUnrecordedUnlock",
        corpId: entry.corporationId.toString(),
        nodeId: entry.nodeId,
      },
    });
  }
}
