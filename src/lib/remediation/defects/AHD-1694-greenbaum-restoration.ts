import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import { checkCharterEligibility, issueCharter } from "@/lib/banking/charter";
import { settleTransition } from "@/lib/banking/settlementJournal";
import type {
  Defect,
  DetectResult,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";

/**
 * Support incident #1694, Greenbaum Group (sequential 493).
 *
 * Greenbaum's retail bank failed at turn 438 holding 15.8B of marked
 * sovereign treasuries and a 0.90 capital ratio. The confidence score and the
 * red-band run test read only vault cash, while the treasury auto-sweep had
 * moved spare cash into bills. Contagion from the injection failures pushed it
 * red, flight emptied the 1.32B vault and the run test closed a solvent bank.
 * The code half is PR #5062 (treasuries count as liquid cover).
 *
 * Resolution paid the 16.26B household deposit book from the vault (3.84B),
 * the USD deposit insurance fund (6.54B) and the treasury backstop (5.88B).
 * The bank's own 14.0B bond then matured into the insurance fund at turn 467,
 * and its loan book recoveries keep flowing there. The owner received nothing.
 *
 * Owner decision 2026-10-27: return the 3.005B of capital the owner posted,
 * MOVED from the USD insurance fund (which collected more from Greenbaum's
 * estate than it paid out), so no money is created, and reopen the retail
 * bank with fresh books through `issueCharter`, which posts the required
 * capital out of the corporation's cash like any player charter.
 */

export const DEFECT_ID = "AHD-1694-greenbaum-restoration";
const MARKER_PATH = `remediation.${DEFECT_ID}`;
const TICKET = 1694;
const CURRENCY: CurrencyCode = "USD";
const FUND_ID = "USD";
const CORPORATION_ID = "6ac3d322a81b3ad796ca1068";
const NAME = "Greenbaum Group";
const SEQUENTIAL_ID = 493;
/** bankCharter.postedCapital at the turn 438 failure. */
const REFUND = 3_005_000_000;
const MOVE_KEY = `remediation:${DEFECT_ID}:${CORPORATION_ID}`;

interface Marker {
  ticket: number;
  refund: number;
  reopen: "pending" | "done" | `refused: ${string}`;
  creditedAt?: Date;
  runId?: string | null;
}

type CorpDoc = Pick<Corporation, "_id" | "name" | "bankCharter" | "liquidCapital"> & {
  remediation?: Record<string, Marker | undefined>;
};

async function load(db: Db): Promise<CorpDoc | null> {
  return db
    .collection<CorpDoc>("corporations")
    .findOne(
      { _id: new ObjectId(CORPORATION_ID) },
      { projection: { name: 1, bankCharter: 1, liquidCapital: 1, remediation: 1 } }
    );
}

const markerOf = (doc: CorpDoc | null) => doc?.remediation?.[DEFECT_ID];

async function currentTurn(db: Db): Promise<number> {
  return (
    (
      await db
        .collection<{ _id: string; currentTurn?: number }>("gameState")
        .findOne({ _id: "current" }, { projection: { currentTurn: 1 } })
    )?.currentTurn ?? 0
  );
}

function outstanding(doc: CorpDoc | null): { refund: boolean; reopen: boolean } {
  const marker = markerOf(doc);
  return {
    refund: !!doc && !marker,
    reopen:
      !!doc && doc.bankCharter?.status !== "active" && (!marker || marker.reopen === "pending"),
  };
}

async function detect(db: Db): Promise<DetectResult> {
  const doc = await load(db);
  const o = outstanding(doc);
  return {
    affected: (o.refund ? 1 : 0) + (o.reopen ? 1 : 0),
    sample: [
      ...(o.refund ? [{ step: "refund", seq: SEQUENTIAL_ID, amount: REFUND }] : []),
      ...(o.reopen ? [{ step: "reopen", seq: SEQUENTIAL_ID, as: "retail" }] : []),
    ],
    notes: doc
      ? [`incident #${TICKET}: ${NAME} refund ${o.refund ? "due" : "done"}`]
      : [`${NAME} (${SEQUENTIAL_ID}) is gone; nothing to restore`],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const doc = await load(db);
  const o = outstanding(doc);
  const notes: string[] = [];
  if (doc && o.reopen) {
    const corp = (await db
      .collection<Corporation>("corporations")
      .findOne({ _id: doc._id })) as Corporation;
    const eligibility = await checkCharterEligibility(
      db,
      { ...corp, liquidCapital: (corp.liquidCapital ?? 0) + (o.refund ? REFUND : 0) },
      "retail",
      CURRENCY
    );
    notes.push(
      eligibility.eligible
        ? `${NAME}: reopen as retail is eligible`
        : `${NAME}: reopen as retail would be refused: ${eligibility.reasons.join("; ")}`
    );
  }
  const fund = await db
    .collection<{ _id: string; balance?: number }>("depositInsuranceFunds")
    .findOne({ _id: FUND_ID }, { projection: { balance: 1 } });
  return {
    affected: (o.refund ? 1 : 0) + (o.reopen ? 1 : 0),
    touched: [
      { collection: "corporations", ids: doc ? [CORPORATION_ID] : [] },
      { collection: "depositInsuranceFunds", ids: o.refund ? [FUND_ID] : [] },
    ],
    // A transfer, not a mint: the fund pays exactly what the corporation gets.
    moneyDelta: 0,
    summary: `AHD-1694 Greenbaum: move ${REFUND.toLocaleString("en-US")} USD of posted capital from the USD insurance fund to ${NAME} and reopen its retail bank`,
    notes: [`USD insurance fund balance ${(fund?.balance ?? 0).toLocaleString("en-US")}`, ...notes],
    payload: o,
  };
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as { refund: boolean; reopen: boolean } | undefined;
  const notes: string[] = [];
  const id = new ObjectId(CORPORATION_ID);
  const turn = await currentTurn(db);
  let credited = false;

  if (payload?.refund) {
    // Claim the marker first so a retry can never pay twice; the journal key
    // makes the transfer itself idempotent as well.
    const claimed = await db.collection<CorpDoc>("corporations").updateOne(
      { _id: id, [MARKER_PATH]: { $exists: false } },
      {
        $set: {
          [MARKER_PATH]: {
            ticket: TICKET,
            refund: REFUND,
            reopen: "pending",
            creditedAt: ctx.now,
            runId: ctx.runId ?? null,
          } satisfies Marker,
          updatedAt: ctx.now,
        },
      }
    );
    if (claimed.modifiedCount === 1) {
      const move = await settleTransition(db, {
        key: MOVE_KEY,
        kind: "insurance_estate_restitution",
        turn,
        currency: CURRENCY,
        legs: [
          {
            kind: "debit",
            amount: REFUND,
            collection: "depositInsuranceFunds",
            filter: { _id: FUND_ID },
            path: "balance",
            note: "estate surplus the insurer collected from Greenbaum's matured bonds",
          },
          {
            kind: "credit",
            amount: REFUND,
            collection: "corporations",
            filter: { _id: id },
            path: "liquidCapital",
            note: "posted capital returned to the owner of the wrongly failed bank",
          },
        ],
        projections: [],
        event: { kind: "bank.resolved", command: "remediation.greenbaum", amount: REFUND },
      });
      if (move.status !== "applied" || move.error) {
        await db
          .collection<CorpDoc>("corporations")
          .updateOne({ _id: id }, { $unset: { [MARKER_PATH]: "" } });
        return {
          documentsScanned: 1,
          documentsUpdated: 0,
          notes: [`transfer ${move.status}: ${move.error ?? "no detail"}; marker released`],
        };
      }
      credited = true;
      const entry: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged"> = {
        type: "restitution_credit" as const,
        turn,
        createdAt: ctx.now,
        subjectType: "corporation" as const,
        subjectId: id,
        subjectName: NAME,
        amount: REFUND,
        currencyCode: CURRENCY,
        anchorAmount: REFUND,
        meta: {
          ticket: TICKET,
          defectId: DEFECT_ID,
          runId: ctx.runId ?? null,
          kind: "wrongful_bank_failure_capital_return",
          fundedBy: "depositInsuranceFunds:USD",
        },
      };
      await emitTxBulk(db, [entry], await loadTxThresholds(db));
      notes.push(`moved ${REFUND.toLocaleString("en-US")} USD from the insurance fund`);
    }
  }

  let reopened = false;
  if (payload?.reopen) {
    const doc = await load(db);
    if (doc && doc.bankCharter?.status !== "active" && markerOf(doc)?.reopen === "pending") {
      const result = await issueCharter(db, id, "retail", CURRENCY);
      const outcome: Marker["reopen"] = result.ok
        ? "done"
        : `refused: ${(result.reasons[0] ?? "ineligible").slice(0, 120)}`;
      await db
        .collection<CorpDoc>("corporations")
        .updateOne({ _id: id }, { $set: { [`${MARKER_PATH}.reopen`]: outcome } });
      reopened = result.ok;
      notes.push(`reopen as retail ${outcome}`);
    }
  }

  return {
    documentsScanned: 1,
    documentsUpdated: (credited ? 1 : 0) + (reopened ? 1 : 0),
    notes,
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const doc = await load(db);
  const o = outstanding(doc);
  const reopen = markerOf(doc)?.reopen;
  return {
    ok: !o.refund && !o.reopen,
    remaining: (o.refund ? 1 : 0) + (o.reopen ? 1 : 0),
    notes: [
      `charter ${doc?.bankCharter?.status ?? "none"}`,
      ...(String(reopen ?? "").startsWith("refused") ? [`${NAME}: ${reopen}`] : []),
    ],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title:
    "Greenbaum Group's solvent bank failed a cash-only run test: return its posted capital from the insurance fund and reopen it",
  severity: "P1",
  codeFix: { pr: 5062 },
  seedFix: {
    status: "not-needed",
    note: "runtime charters and insurance funds; seeds create neither",
  },
  envs: ["prod"],
  idempotent: true,
  mintsMoney: false,
  guards: ["turn-lock-free", "max-affected:2"],
  detect,
  plan,
  apply,
  verify,
};
