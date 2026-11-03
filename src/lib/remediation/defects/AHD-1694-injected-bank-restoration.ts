import { ObjectId, type Db } from "mongodb";
import type { BankCharterType, Corporation } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import { checkCharterEligibility, issueCharter } from "@/lib/banking/charter";
import type {
  Defect,
  DetectResult,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";

/**
 * Support incident #1694. US central bank liquidity injections (turns 274,
 * 365, 392, 405, 449 and 455) credited private banks' vaults and booked the
 * same amount as INTEREST-BEARING central bank margin debt. The banks never
 * asked for the cash. The margin interest exceeded their income and consumed
 * their own capital, until the solvency pass failed them or supervision
 * revoked them as undercapitalized. Resolution then repaid the injected debt
 * from the vault and paid the owners nothing.
 *
 * The code half (injected debt is interest-free) is PR #5035.
 *
 * WHAT IS RESTITUTED
 *
 * 1. Every bank that received an injection gets back the margin interest it
 *    paid, credited to the owning corporation's liquidCapital. Every dollar of
 *    these banks' margin debt came from injections (debt at closure equals the
 *    injected total for each), so all of their `cb_margin_interest` payments
 *    are injection interest. Totals are summed from the applied
 *    `cb-margin-interest:<bank>:<turn>` money moves, to the cent.
 *
 * 2. Banks closed by the injections and not yet rechartered by their owners
 *    are reopened with their original charter type through `issueCharter`,
 *    the normal player path, which posts the required capital out of the
 *    refunded cash. Books start clean: the household deposit book already
 *    went back to the money supply at resolution.
 *
 * Deliberately NOT reopened here:
 *   - American Broadcasting Company and the corporation at sequential 883:
 *     their owners already rechartered; refund only.
 *   - Continental Merchants Bancorp (AI): its estate never resolved
 *     (no depositorsResolvedTurn), so a recharter is refused until it does.
 *   - Greenbaum Group and Artemis Global: injection interest refunded, but
 *     their failures were driven mainly by a deposit run, assessed separately.
 *
 * IDEMPOTENCY
 *
 * The refund writes a durable `remediation["AHD-1694-..."]` marker in the
 * same atomic update as the increment, under a filter requiring its absence.
 * The reopen step only runs on a corporation whose marker has
 * `reopen: "pending"` and whose charter is not active, and stamps the result.
 *
 * This heal MINTS MONEY on purpose: it restores capital the injection
 * interest destroyed. Each credit emits a `restitution_credit` tx row so the
 * shadow ledger books an attributed mint.
 */

export const DEFECT_ID = "AHD-1694-injected-bank-restoration";
const MARKER_PATH = `remediation.${DEFECT_ID}`;
const TICKET = 1694;
const CURRENCY: CurrencyCode = "USD";

interface Row {
  corporationId: string;
  sequentialId: number;
  name: string;
  /** Margin interest paid on injected debt, USD, rounded to the cent. */
  refund: number;
  /** Charter type to reopen with, or null to refund only. */
  reopenAs: BankCharterType | null;
  reason: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export const ROWS: readonly Row[] = [
  {
    corporationId: "6acabe52991874547f66cbf2",
    sequentialId: 823,
    name: "The Trump Organization",
    refund: round2(283_792_987.9243228),
    reopenAs: "retail",
    reason: "failed turn 436 under $17.35B injected debt",
  },
  {
    corporationId: "6ac45010a08d683f53ebdfde",
    sequentialId: 513,
    name: "Jayden Petersen Inc.",
    refund: round2(112_847_222.21770838),
    reopenAs: "investment",
    reason: "revoked undercapitalized turn 461 under $16.67B injected debt",
  },
  {
    corporationId: "6ad07b9b338ba1a1f51c94bb",
    sequentialId: 1322,
    name: "Flaco Logistics",
    refund: round2(112_846_180.55104169),
    reopenAs: "investment",
    reason: "revoked undercapitalized turn 461 under $16.67B injected debt",
  },
  {
    corporationId: "6ac6b7002b4e90485d740da9",
    sequentialId: 630,
    name: "Eli Lilly and Company",
    refund: round2(112_847_222.21770838),
    reopenAs: "investment",
    reason: "revoked undercapitalized turn 461 under $16.67B injected debt",
  },
  {
    corporationId: "6ac3cb71f6b04c52a0086bca",
    sequentialId: 461,
    name: "Prairie States Financial",
    refund: round2(27_559_113.761666667),
    reopenAs: "retail",
    reason: "failed turn 420 under $3.38B injected debt",
  },
  {
    corporationId: "6adb7b12088b05d77cc73791",
    sequentialId: 2050,
    name: "American Broadcasting Company",
    refund: round2(52_083_333.333333336),
    reopenAs: null,
    reason: "failed turn 456 under $100B injected debt; owner already rechartered",
  },
  {
    corporationId: "6acba7267f0eaca56be74741",
    sequentialId: 883,
    name: "corporation 883",
    refund: round2(235_161_885.5714583),
    reopenAs: null,
    reason: "failed turn 421 under $27.71B injected debt; owner already rechartered",
  },
  {
    corporationId: "6ac3cb71f6b04c52a0086bc5",
    sequentialId: 460,
    name: "Continental Merchants Bancorp",
    refund: round2(15_514_583.633125003),
    reopenAs: null,
    reason: "failed turn 419 under $2.03B injected debt; estate unresolved, reopen later",
  },
  {
    corporationId: "6ac3d322a81b3ad796ca1068",
    sequentialId: 493,
    name: "Greenbaum Group",
    refund: round2(13_483_892.618645828),
    reopenAs: null,
    reason: "injection interest refunded; deposit-run failures assessed separately",
  },
  {
    corporationId: "6ac3eef8a08d683f53ebcd98",
    sequentialId: 502,
    name: "Artemis Global",
    refund: round2(274_779.79546874994),
    reopenAs: null,
    reason: "injection interest refunded; failure assessed separately",
  },
];

interface Marker {
  ticket: number;
  refund: number;
  reopen: "pending" | "done" | "not-planned" | `refused: ${string}`;
}

type CorpDoc = Pick<Corporation, "_id" | "name" | "bankCharter" | "liquidCapital"> & {
  remediation?: Record<string, Marker | undefined>;
};

async function load(db: Db): Promise<Map<string, CorpDoc>> {
  const docs = await db
    .collection<CorpDoc>("corporations")
    .find(
      { _id: { $in: ROWS.map((row) => new ObjectId(row.corporationId)) } },
      { projection: { name: 1, bankCharter: 1, liquidCapital: 1, remediation: 1 } }
    )
    .toArray();
  return new Map(docs.map((doc) => [doc._id.toString(), doc]));
}

const markerOf = (doc: CorpDoc | undefined) => doc?.remediation?.[DEFECT_ID];

interface Pending {
  refunds: Row[];
  reopens: Row[];
  missing: Row[];
}

async function pending(db: Db): Promise<Pending> {
  const docs = await load(db);
  const out: Pending = { refunds: [], reopens: [], missing: [] };
  for (const row of ROWS) {
    const doc = docs.get(row.corporationId);
    if (!doc) {
      out.missing.push(row);
      continue;
    }
    const marker = markerOf(doc);
    if (!marker) out.refunds.push(row);
    if (
      row.reopenAs &&
      doc.bankCharter?.status !== "active" &&
      (!marker || marker.reopen === "pending")
    )
      out.reopens.push(row);
  }
  return out;
}

async function detect(db: Db): Promise<DetectResult> {
  const p = await pending(db);
  return {
    affected: p.refunds.length + p.reopens.length,
    sample: [
      ...p.refunds.map((row) => ({ step: "refund", seq: row.sequentialId, amount: row.refund })),
      ...p.reopens.map((row) => ({ step: "reopen", seq: row.sequentialId, as: row.reopenAs })),
    ],
    notes: [
      `incident #${TICKET}: ${p.refunds.length} refunds and ${p.reopens.length} reopens outstanding`,
      ...p.missing.map((row) => `${row.name} (${row.sequentialId}) is gone; nothing to restore`),
    ],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const p = await pending(db);
  const docs = await load(db);
  const total = round2(p.refunds.reduce((sum, row) => sum + row.refund, 0));
  const notes: string[] = [];
  for (const row of p.reopens) {
    const doc = docs.get(row.corporationId);
    if (!doc) continue;
    // Eligibility is checked as if the refund had landed: capital comes from it.
    const corp = (await db
      .collection<Corporation>("corporations")
      .findOne({ _id: doc._id })) as Corporation;
    const marker = markerOf(doc);
    const refunded = marker ? 0 : row.refund;
    const eligibility = await checkCharterEligibility(
      db,
      { ...corp, liquidCapital: (corp.liquidCapital ?? 0) + refunded },
      row.reopenAs!,
      CURRENCY
    );
    notes.push(
      eligibility.eligible
        ? `${row.name}: reopen as ${row.reopenAs} is eligible`
        : `${row.name}: reopen as ${row.reopenAs} would be refused: ${eligibility.reasons.join("; ")}`
    );
  }
  return {
    affected: p.refunds.length + p.reopens.length,
    touched: [
      {
        collection: "corporations",
        ids: [...new Set([...p.refunds, ...p.reopens].map((row) => row.corporationId))],
      },
    ],
    moneyDelta: total,
    summary: `AHD-1694: refund ${total.toLocaleString("en-US")} USD of injection interest to ${p.refunds.length} bank owners and reopen ${p.reopens.length} closed banks`,
    notes: [
      ...ROWS.filter((row) => p.refunds.includes(row)).map(
        (row) =>
          `${row.name} (${row.sequentialId}): refund ${row.refund.toLocaleString("en-US")} USD; ${row.reason}`
      ),
      ...notes,
      "MINTS MONEY deliberately: restores capital the injection interest destroyed",
    ],
    payload: { refunds: p.refunds, reopens: p.reopens },
  };
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as { refunds: Row[]; reopens: Row[] } | undefined;
  const refunds = payload?.refunds ?? [];
  const reopens = payload?.reopens ?? [];
  const credited: Row[] = [];
  const notes: string[] = [];

  for (const row of refunds) {
    const marker: Marker = {
      ticket: TICKET,
      refund: row.refund,
      reopen: row.reopenAs ? "pending" : "not-planned",
    };
    const res = await db.collection<CorpDoc>("corporations").updateOne(
      { _id: new ObjectId(row.corporationId), [MARKER_PATH]: { $exists: false } },
      {
        $inc: { liquidCapital: row.refund },
        $set: {
          [MARKER_PATH]: { ...marker, creditedAt: ctx.now, runId: ctx.runId ?? null },
          updatedAt: ctx.now,
        },
      }
    );
    if (res.modifiedCount === 1) credited.push(row);
  }

  if (credited.length > 0) {
    const turn =
      (
        await db
          .collection<{ _id: string; currentTurn?: number }>("gameState")
          .findOne({ _id: "current" }, { projection: { currentTurn: 1 } })
      )?.currentTurn ?? 0;
    const entries: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[] = credited.map(
      (row) => ({
        type: "restitution_credit" as const,
        turn,
        createdAt: ctx.now,
        subjectType: "corporation" as const,
        subjectId: new ObjectId(row.corporationId),
        subjectName: row.name,
        amount: row.refund,
        currencyCode: CURRENCY,
        anchorAmount: row.refund,
        meta: {
          ticket: TICKET,
          defectId: DEFECT_ID,
          runId: ctx.runId ?? null,
          kind: "injection_interest_refund",
          reason: row.reason,
        },
      })
    );
    await emitTxBulk(db, entries, await loadTxThresholds(db));
  }

  let reopened = 0;
  for (const row of reopens) {
    const id = new ObjectId(row.corporationId);
    const doc = await db
      .collection<CorpDoc>("corporations")
      .findOne({ _id: id }, { projection: { bankCharter: 1, remediation: 1 } });
    if (!doc || doc.bankCharter?.status === "active" || markerOf(doc)?.reopen !== "pending")
      continue;
    const result = await issueCharter(db, id, row.reopenAs!, CURRENCY);
    const outcome: Marker["reopen"] = result.ok
      ? "done"
      : `refused: ${(result.reasons[0] ?? "ineligible").slice(0, 120)}`;
    await db
      .collection<CorpDoc>("corporations")
      .updateOne({ _id: id }, { $set: { [`${MARKER_PATH}.reopen`]: outcome } });
    if (result.ok) reopened += 1;
    notes.push(`${row.name}: reopen as ${row.reopenAs} ${outcome}`);
  }

  const insertedTxIds = ctx.runId
    ? await db
        .collection<FinancialTxLogEntry>("financialTxLog")
        .find({ type: "restitution_credit", "meta.runId": ctx.runId }, { projection: { _id: 1 } })
        .toArray()
    : [];

  return {
    documentsScanned: refunds.length + reopens.length,
    documentsUpdated: credited.length + reopened,
    insertedIds:
      insertedTxIds.length > 0
        ? [{ collection: "financialTxLog", ids: insertedTxIds.map((doc) => doc._id.toString()) }]
        : undefined,
    notes: [
      `refunded ${credited.length} of ${refunds.length} owners`,
      `reopened ${reopened} of ${reopens.length} banks`,
      ...notes,
    ],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const p = await pending(db);
  const docs = await load(db);
  const refused = ROWS.filter((row) =>
    String(markerOf(docs.get(row.corporationId))?.reopen ?? "").startsWith("refused")
  );
  return {
    ok: p.refunds.length === 0 && p.reopens.length === 0,
    remaining: p.refunds.length + p.reopens.length,
    notes: [
      `${ROWS.length - p.refunds.length} of ${ROWS.length} owners refunded`,
      ...refused.map(
        (row) => `${row.name}: ${markerOf(docs.get(row.corporationId))?.reopen ?? ""}`
      ),
    ],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title:
    "Central bank liquidity injections charged interest that failed or revoked banks: refund it and reopen the banks",
  severity: "P1",
  codeFix: { pr: 5035 },
  seedFix: {
    status: "not-needed",
    note: "runtime central bank operations and runtime charters; seeds create neither",
  },
  envs: ["prod"],
  idempotent: true,
  mintsMoney: true,
  guards: ["turn-lock-free", `max-affected:${ROWS.length * 2}`],
  detect,
  plan,
  apply,
  verify,
};
