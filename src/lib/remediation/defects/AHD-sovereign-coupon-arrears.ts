/**
 * Sovereign coupon arrears kept as one claim per bond per unpaid turn.
 *
 * Per-bond claims pile up for large debtors and every Treasury pass groups
 * the whole open queue. This folds existing per-bond claims into one claim
 * per budget, currency and payee group, each payee owed the sum of its legs
 * under the same frozen quote. No money moves.
 *
 * Left alone: claims owned by a journal receipt, claims still being published
 * to (pendingSettlementProjection), and groups frozen under more than one
 * native quote.
 *
 * Each group commits in one transaction that re-reads its members and aborts
 * if any changed since backup. Roll back only before the next Treasury pass:
 * once a folded claim is paid, restoring its members would owe them again.
 */
import type { Db } from "mongodb";
import type { FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import {
  SOVEREIGN_COUPON_CLAIMS_COLLECTION,
  claimIdOfMove,
  type SovereignCouponClaimRecord,
} from "@/lib/banking/fundedSovereignCoupons";
import { groupSovereignCouponClaims } from "@/lib/banking/rules/sovereignCoupons";
import { HEAL_BACKUPS_COLLECTION } from "../backup";
import type {
  Defect,
  DetectResult,
  HealBackup,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

export const DEFECT_ID = "AHD-sovereign-coupon-arrears";

const HEAL_ID_SUFFIX = ":heal";
const PLAYER_KINDS = ["character", "imperial", "corporation"];
const OWNED_LOOKUP_CHUNK = 50_000;

export interface ArrearsGroupPlan {
  budgetId: string;
  dueTurn: number;
  currencyCode: string;
  anchorRate: number;
  /** Per-bond claims the group folds. */
  claims: number;
  /** Sum of their amounts, as the server added them. */
  amountLocal: number;
  /** Claims after folding: one per payee group present. */
  folded: number;
}

interface Payload {
  turn: number;
  openBefore: number;
  /** Open claims a receipt owns; never folded. */
  owned: string[];
  pending: number;
  mixedQuoteGroups: number;
  groups: ArrearsGroupPlan[];
}

/** Open per-bond claims, excluding the ones the journal still publishes to. */
function foldableFilter(owned: readonly string[]): Record<string, unknown> {
  return {
    settledTurn: { $exists: false },
    pendingSettlementProjection: { $exists: false },
    $and: [
      { _id: { $not: { $regex: "^sovereign-coupon:grp~" } } },
      ...(owned.length ? [{ _id: { $nin: [...owned] } }] : []),
    ],
  };
}

const claims = (db: Db) =>
  db.collection<SovereignCouponClaimRecord>(SOVEREIGN_COUPON_CLAIMS_COLLECTION);

async function currentTurn(db: Db): Promise<number> {
  const state = await gameStateCollection<{ _id: string; currentTurn?: number; turn?: number }>(
    db
  ).findOne({ _id: "current" }, { projection: { currentTurn: 1, turn: 1 } });
  return state?.currentTurn ?? state?.turn ?? 0;
}

/**
 * Open claims a journal receipt owns: every claim a per-claim attempt or a
 * grouped receipt names, unless that receipt was rejected (a rejected receipt
 * moved no money and owns nothing). Read-only.
 */
export async function ownedOpenCouponClaimIds(db: Db): Promise<string[]> {
  const moves = db.collection<{
    _id: string;
    status?: string;
    event?: { meta?: { claimIds?: unknown } };
  }>("bankMoneyMoves");
  const named = new Set<string>();
  for (const move of await moves
    .find(
      { _id: { $regex: "^sovereign-coupon:" }, status: { $ne: "rejected" } },
      { projection: { _id: 1 } }
    )
    .toArray())
    if (move._id.includes(":attempt:")) named.add(claimIdOfMove(move._id));
  const batches = moves.find(
    { _id: { $regex: "^sovereign-coupon-batch:" }, status: { $ne: "rejected" } },
    { projection: { "event.meta.claimIds": 1 } }
  );
  for await (const batch of batches)
    for (const id of String(batch.event?.meta?.claimIds ?? "").split(",")) if (id) named.add(id);
  const ids = [...named];
  const open: string[] = [];
  for (let i = 0; i < ids.length; i += OWNED_LOOKUP_CHUNK) {
    const rows = await claims(db)
      .find(
        { _id: { $in: ids.slice(i, i + OWNED_LOOKUP_CHUNK) }, settledTurn: { $exists: false } },
        { projection: { _id: 1 } }
      )
      .toArray();
    for (const row of rows) open.push(row._id);
  }
  return open.sort();
}

interface GroupRow {
  _id: { budgetId: string; dueTurn: number; currencyCode: string };
  claims: number;
  amountLocal: number;
  minRate: number;
  maxRate: number;
}

/** Read-only: every budget, turn and currency of open per-bond claims, and what it folds into. */
export async function surveyCouponArrears(db: Db): Promise<Payload> {
  const turn = await currentTurn(db);
  const owned = await ownedOpenCouponClaimIds(db);
  const filter = foldableFilter(owned);
  const key = {
    budgetId: "$budgetId",
    dueTurn: "$claim.dueTurn",
    currencyCode: "$claim.currencyCode",
  };
  const [openBefore, pending, rows, playerRows] = await Promise.all([
    claims(db).countDocuments({ settledTurn: { $exists: false } }),
    claims(db).countDocuments({
      settledTurn: { $exists: false },
      pendingSettlementProjection: { $exists: true },
    }),
    claims(db)
      .aggregate<GroupRow>(
        [
          { $match: filter },
          {
            $group: {
              _id: key,
              claims: { $sum: 1 },
              amountLocal: { $sum: "$claim.amountLocal" },
              minRate: { $min: "$claim.anchorRate" },
              maxRate: { $max: "$claim.anchorRate" },
            },
          },
        ],
        { allowDiskUse: true }
      )
      .toArray(),
    claims(db)
      .aggregate<{ _id: GroupRow["_id"] }>(
        [
          { $match: { ...filter, "claim.holders.kind": { $in: PLAYER_KINDS } } },
          { $group: { _id: key } },
        ],
        { allowDiskUse: true }
      )
      .toArray(),
  ]);
  const keyOf = (id: GroupRow["_id"]) => JSON.stringify([id.budgetId, id.dueTurn, id.currencyCode]);
  const withPlayers = new Set(playerRows.map((row) => keyOf(row._id)));
  let mixedQuoteGroups = 0;
  const groups: ArrearsGroupPlan[] = [];
  for (const row of rows) {
    // A group frozen under two quotes would fold into two claims sharing an id.
    if (row.minRate !== row.maxRate) {
      mixedQuoteGroups += 1;
      continue;
    }
    // A lone market-only claim is already the folded shape in all but name.
    const folded = withPlayers.has(keyOf(row._id)) ? 2 : 1;
    if (row.claims === 1 && folded === 1) continue;
    groups.push({
      budgetId: row._id.budgetId,
      dueTurn: row._id.dueTurn,
      currencyCode: row._id.currencyCode,
      anchorRate: row.minRate,
      claims: row.claims,
      amountLocal: row.amountLocal,
      folded,
    });
  }
  groups.sort(
    (a, b) =>
      a.budgetId.localeCompare(b.budgetId) ||
      a.dueTurn - b.dueTurn ||
      a.currencyCode.localeCompare(b.currencyCode)
  );
  return { turn, openBefore, owned, pending, mixedQuoteGroups, groups };
}

function summarize(payload: Payload) {
  const folded = payload.groups.reduce((sum, row) => sum + row.claims, 0);
  const after = payload.groups.reduce((sum, row) => sum + row.folded, 0);
  return { folded, after, openAfter: payload.openBefore - folded + after };
}

async function detect(db: Db): Promise<DetectResult> {
  const payload = await surveyCouponArrears(db);
  const { folded, after, openAfter } = summarize(payload);
  return {
    affected: folded,
    sample: payload.groups
      .slice()
      .sort((a, b) => b.claims - a.claims)
      .slice(0, 10)
      .map((row) => ({
        budgetId: row.budgetId,
        dueTurn: row.dueTurn,
        claims: row.claims,
        folded: row.folded,
      })),
    notes: [
      `turn ${payload.turn}: ${payload.openBefore} open coupon claims; folding ${folded} per-bond claims into ${after} leaves ${openAfter}`,
    ],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const payload = await surveyCouponArrears(db);
  const { folded, after, openAfter } = summarize(payload);
  if (payload.groups.length === 0)
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary: `${DEFECT_ID}: no per-bond coupon arrears to fold`,
      payload,
    };
  const byBudget = new Map<string, { claims: number; folded: number; turns: number }>();
  for (const row of payload.groups) {
    const entry = byBudget.get(row.budgetId) ?? { claims: 0, folded: 0, turns: 0 };
    entry.claims += row.claims;
    entry.folded += row.folded;
    entry.turns += 1;
    byBudget.set(row.budgetId, entry);
  }
  return {
    affected: folded,
    // Each group backs up its own members just before it commits; a snapshot
    // of a million documents one read at a time would not finish.
    touched: [],
    moneyDelta: 0,
    summary: `${DEFECT_ID}: fold ${folded} open per-bond coupon claims into ${after} (open claims ${payload.openBefore} -> ${openAfter}); every payee owed the same`,
    notes: [
      "money conserving: each payee's legs are summed under their frozen quote; nothing is paid or forgiven",
      `left alone: ${payload.owned.length} claims a journal receipt owns, ${payload.pending} still publishing, ${payload.mixedQuoteGroups} groups frozen under more than one quote`,
      "roll back only before the next Treasury pass; a paid folded claim would otherwise be owed again",
      ...[...byBudget.entries()]
        .sort(([, a], [, b]) => b.claims - a.claims)
        .map(
          ([budgetId, entry]) =>
            `${budgetId}: ${entry.claims} claims over ${entry.turns} turns -> ${entry.folded}`
        ),
    ],
    payload,
  };
}

function owedByPayee(list: readonly FundedSovereignCouponClaim[]): Map<string, number> {
  const owed = new Map<string, number>();
  for (const claim of list)
    for (const holder of claim.holders) {
      const key = JSON.stringify([
        holder.kind,
        holder.id ?? null,
        holder.payeeCurrencyCode ?? null,
      ]);
      owed.set(key, (owed.get(key) ?? 0) + holder.amountLocal);
    }
  return owed;
}

const closeEnough = (a: number, b: number) =>
  Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;

async function applyGroup(
  db: Db,
  row: ArrearsGroupPlan,
  owned: readonly string[],
  ctx: HealContext
): Promise<string[] | null> {
  const filter = {
    ...foldableFilter(owned),
    budgetId: row.budgetId,
    "claim.dueTurn": row.dueTurn,
    "claim.currencyCode": row.currencyCode,
  };
  const members = await claims(db).find(filter).sort({ order: 1, _id: 1 }).toArray();
  if (
    members.length !== row.claims ||
    !closeEnough(
      members.reduce((sum, member) => sum + member.claim.amountLocal, 0),
      row.amountLocal
    ) ||
    members.some((member) => member.claim.anchorRate !== row.anchorRate)
  )
    return null;
  const folded = groupSovereignCouponClaims(
    row.budgetId,
    members.map((member) => member.claim),
    HEAL_ID_SUFFIX
  );
  // The fold is a sum per payee; check it before anything is written.
  const before = owedByPayee(members.map((member) => member.claim));
  const after = owedByPayee(folded.map((entry) => entry.claim));
  if (
    before.size !== after.size ||
    [...before].some(([key, amount]) => !closeEnough(after.get(key) ?? NaN, amount))
  )
    return null;
  const ids = members.map((member) => member._id);
  const backups = db.collection<HealBackup>(HEAL_BACKUPS_COLLECTION);
  await backups.insertMany(
    members.map((member) => ({
      runId: ctx.runId ?? "",
      defectId: DEFECT_ID,
      collection: SOVEREIGN_COUPON_CLAIMS_COLLECTION,
      docId: member._id,
      doc: member as unknown as Record<string, unknown>,
      createdAt: ctx.now,
    })),
    { ordered: true }
  );
  const records: SovereignCouponClaimRecord[] = folded.map((entry, order) => ({
    _id: entry.claim.id,
    budgetId: row.budgetId,
    order,
    claim: entry.claim,
    createdAt: ctx.now,
  }));
  try {
    await runRequiredTransaction(
      async (session) => {
        // The members as they are now. Any change since the backup (paid,
        // claimed by a receipt, moved) aborts the group.
        const live = await claims(db)
          .find({ ...filter, _id: { $in: ids } }, { session, projection: { _id: 1, claim: 1 } })
          .toArray();
        const byId = new Map(live.map((member) => [member._id, member]));
        if (
          live.length !== members.length ||
          members.some(
            (member) => JSON.stringify(byId.get(member._id)?.claim) !== JSON.stringify(member.claim)
          )
        )
          throw new Error("group moved after the backup");
        await claims(db).insertMany(records, { session });
        const removed = await claims(db).deleteMany(
          { _id: { $in: ids }, settledTurn: { $exists: false } },
          { session }
        );
        if (removed.deletedCount !== ids.length) throw new Error("group moved after the backup");
      },
      { client: (db as Db & { client?: import("mongodb").MongoClient }).client }
    );
  } catch {
    // Nothing changed; drop the backup rows so a rollback cannot restore
    // documents this run never touched.
    await backups.deleteMany({ runId: ctx.runId ?? "", docId: { $in: ids } });
    return null;
  }
  return records.map((record) => record._id);
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as Payload | undefined;
  const groups = payload?.groups ?? [];
  const inserted: string[] = [];
  let removed = 0;
  const skipped: string[] = [];
  for (const row of groups) {
    const ids = await applyGroup(db, row, payload!.owned, ctx);
    if (ids) {
      inserted.push(...ids);
      removed += row.claims;
    } else skipped.push(`${row.budgetId} t${row.dueTurn} ${row.currencyCode}`);
  }
  return {
    documentsScanned: groups.reduce((sum, row) => sum + row.claims, 0),
    documentsUpdated: removed,
    documentsInserted: inserted.length,
    insertedIds: [{ collection: SOVEREIGN_COUPON_CLAIMS_COLLECTION, ids: inserted }],
    notes: [
      `${groups.length - skipped.length} groups folded: ${removed} per-bond claims into ${inserted.length}`,
      ...(skipped.length
        ? [
            `${skipped.length} groups moved after the plan and were left alone; re-plan to fold them`,
            ...skipped.slice(0, 20),
          ]
        : []),
    ],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const { groups, owned } = await surveyCouponArrears(db);
  const remaining = groups.reduce((sum, row) => sum + row.claims, 0);
  return {
    ok: remaining === 0,
    remaining,
    notes: [
      remaining === 0
        ? "every open coupon claim is in the folded shape, or a receipt owns it"
        : `${remaining} open per-bond coupon claims still unfolded`,
      `${owned.length} receipt-owned claims left as they are`,
    ],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title: "Sovereign coupon arrears kept as one claim per bond per turn: fold per budget and turn",
  severity: "P1",
  seedFix: {
    status: "not-needed",
    note: "Runtime only: produced by the per-bond coupon accrual of unfunded Treasuries, not by any seed document.",
  },
  envs: ["dev", "sandbox", "prod"],
  idempotent: true,
  guards: ["turn-lock-free", "money-conserving", "max-affected:2000000"],
  detect,
  plan,
  apply,
  verify,
};
