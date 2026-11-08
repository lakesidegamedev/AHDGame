import { ObjectId, type Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import { settleTransition } from "@/lib/banking/settlementJournal";
import { BANK_FAILURE_EVENTS } from "@/lib/banking/failurePolitics";
import type {
  Defect,
  DetectResult,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";

// Frozen turn-601 waterfall resolution: vault plus USD insurance fund
// paid the household book into the central bank. The 22,150.23 household
// book returned to the CB as householdSavingsLiability, so it is not
// restored here; the bank reopens with npc/total deposits equal to the
// household book. The game mints the 304,203.61 shortfall. liquidCapital
// is never touched. Legs are READ from the frozen record.

export const DEFECT_ID = "AHD-1749-monroe-bank-restoration";
export const CASH_AT_WATERFALL = 7_709_632.58738934;
export const SHORTFALL = 304_203.61;

const MARKER_PATH = `remediation.${DEFECT_ID}`;
const TICKET = 1749;
const CURRENCY: CurrencyCode = "USD";
const FUND_ID = "USD";
const CB_ID = "US";
const CORPORATION_ID = "6ae2d9eed7873dea7ec4eaea";
const NAME = "Monroe Indrustry";
const SEQ = 2857;
const CHARTERED_TURN = 583;
const FAILED_TURN = 601;
const RECORD_ID = `deposit-book-return:${CORPORATION_ID}:failure:${FAILED_TURN}`;
const FAILURE_EVENT_ID = `bank-failure:${CORPORATION_ID}:${CHARTERED_TURN}`;
const MOVE_KEY = `remediation:${DEFECT_ID}:${CORPORATION_ID}`;
const POSTED_CAPITAL = 1_666_667;
const TOTAL_LOANS = 1_151_541.02906099;
const CENT = 0.01;

interface FrozenLeg {
  kind?: string;
  amount?: number;
  collection?: string;
  filter?: Record<string, unknown>;
  path?: string;
  note?: string;
}
interface FrozenEntry {
  projection?: {
    collection?: string;
    filter?: Record<string, unknown>;
    update?: Record<string, unknown>;
    insert?: Record<string, unknown>;
    note?: string;
  };
}
interface FrozenRecord {
  _id: string;
  status?: string;
  legs?: FrozenLeg[];
  projections?: FrozenEntry[];
}
interface Marker {
  ticket: number;
  shortfall: number;
  status: "pending" | "done";
}
type CorpDoc = {
  _id: ObjectId;
  name?: string;
  liquidCapital?: number;
  bankCharter?: { status?: string; cashReserves?: number };
  remediation?: Record<string, unknown>;
};
interface Reversal {
  playerBook: number;
  householdBook: number;
  bankCashReversal: number;
  fundCredit: number;
  fundCounters: Record<string, number>;
  treasury?: { amount: number; collection: string; filter: Record<string, unknown>; path: string };
  treasuryCounters?: {
    collection: string;
    filter: Record<string, unknown>;
    inc: Record<string, number>;
  };
  restoredCash: number;
  equity: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
function incOf(update: Record<string, unknown> | undefined): Record<string, number> {
  const inc = update?.$inc;
  if (!inc || typeof inc !== "object") return {};
  const out: Record<string, number> = {};
  for (const [path, value] of Object.entries(inc))
    if (typeof value === "number" && Number.isFinite(value)) out[path] = value;
  return out;
}
async function load(db: Db): Promise<CorpDoc | null> {
  return db
    .collection<CorpDoc>("corporations")
    .findOne(
      { _id: new ObjectId(CORPORATION_ID) },
      { projection: { name: 1, liquidCapital: 1, bankCharter: 1, remediation: 1 } }
    );
}
const markerOf = (doc: CorpDoc | null): Marker | undefined => {
  const v = doc?.remediation?.[DEFECT_ID];
  return v && typeof v === "object" ? (v as Marker) : undefined;
};
async function loadRecord(db: Db): Promise<FrozenRecord | null> {
  return db.collection<FrozenRecord>("bankMoneyMoves").findOne({ _id: RECORD_ID });
}
async function eventExists(db: Db): Promise<boolean> {
  return Boolean(
    await db
      .collection<{ _id: string }>(BANK_FAILURE_EVENTS)
      .findOne({ _id: FAILURE_EVENT_ID }, { projection: { _id: 1 } })
  );
}
function readPlayerBook(record: FrozenRecord): number {
  for (const entry of record.projections ?? []) {
    if (entry.projection?.collection !== "centralBanks") continue;
    const returned = incOf(entry.projection.update).householdSavingsLiability;
    if (returned !== undefined) return Math.abs(returned);
  }
  return 0;
}
function readFundCounters(record: FrozenRecord): Record<string, number> {
  for (const entry of record.projections ?? [])
    if (entry.projection?.collection === "depositInsuranceFunds")
      return incOf(entry.projection.update);
  return {};
}
function readTreasuryCounters(record: FrozenRecord): Reversal["treasuryCounters"] {
  for (const entry of record.projections ?? []) {
    const p = entry.projection;
    if (p?.collection === "federalBudget")
      return { collection: p.collection, filter: p.filter ?? {}, inc: incOf(p.update) };
  }
  return undefined;
}
function buildReversal(
  record: FrozenRecord
): { ok: true; reversal: Reversal } | { ok: false; reason: string } {
  if (record.status !== "applied")
    return {
      ok: false,
      reason: `resolution record is ${record.status ?? "missing status"}, not applied`,
    };
  let bankCashDebit = 0,
    fundDebit = 0,
    treasuryDebit = 0,
    payout = 0;
  let treasuryLeg: Reversal["treasury"];
  for (const leg of record.legs ?? []) {
    const amount = num(leg.amount);
    if (!(amount > 0))
      return { ok: false, reason: `leg "${leg.note ?? "unnamed"}" has no positive amount` };
    if (leg.kind === "debit") {
      if (leg.collection === "corporations" && leg.path === "bankCharter.cashReserves")
        bankCashDebit += amount;
      else if (leg.collection === "depositInsuranceFunds" && leg.path === "balance")
        fundDebit += amount;
      else if (
        leg.collection === "federalBudget" &&
        (leg.path === "treasuryBalance" || leg.path === "treasuryCashLocal")
      ) {
        treasuryDebit += amount;
        treasuryLeg = {
          amount,
          collection: leg.collection,
          filter: leg.filter ?? {},
          path: leg.path,
        };
      } else
        return {
          ok: false,
          reason: `unhandled debit leg ${leg.collection ?? "?"}.${leg.path ?? "?"}`,
        };
    } else if (leg.kind === "credit") {
      if (leg.collection === "centralBanks" && leg.path === "externalBroadMoney") payout += amount;
      else
        return {
          ok: false,
          reason: `unhandled credit leg ${leg.collection ?? "?"}.${leg.path ?? "?"}`,
        };
    } else return { ok: false, reason: `unhandled ${leg.kind ?? "unknown"} leg` };
  }
  if (!(payout > 0)) return { ok: false, reason: "resolution record has no household payout" };
  if (!(bankCashDebit > 0))
    return { ok: false, reason: "resolution record has no bank-cash debit" };
  if (Math.abs(bankCashDebit + fundDebit + treasuryDebit - payout) > CENT)
    return { ok: false, reason: "bank, fund and treasury debits do not equal the payout" };
  const playerBook = readPlayerBook(record);
  if (playerBook > payout || playerBook > bankCashDebit)
    return { ok: false, reason: "player book does not fit the payout or bank-cash debit" };
  const householdBook = payout - playerBook;
  const bankCashReversal = bankCashDebit - playerBook;
  const restoredCash = bankCashReversal + SHORTFALL;
  return {
    ok: true,
    reversal: {
      playerBook,
      householdBook,
      bankCashReversal,
      fundCredit: fundDebit,
      fundCounters: readFundCounters(record),
      ...(treasuryLeg ? { treasury: treasuryLeg } : {}),
      treasuryCounters: readTreasuryCounters(record),
      restoredCash,
      equity: restoredCash + TOTAL_LOANS - householdBook,
    },
  };
}
async function isRestored(db: Db): Promise<{ done: boolean; doc: CorpDoc | null; event: boolean }> {
  const [doc, event] = await Promise.all([load(db), eventExists(db)]);
  return {
    done: markerOf(doc)?.status === "done" && doc?.bankCharter?.status === "active" && !event,
    doc,
    event,
  };
}

async function detect(db: Db): Promise<DetectResult> {
  const { done, doc, event } = await isRestored(db);
  if (!doc)
    return { affected: 0, sample: [], notes: [`${NAME} (${SEQ}) is gone; nothing to restore`] };
  return {
    affected: done ? 0 : 1,
    sample: done
      ? []
      : [
          {
            seq: SEQ,
            charter: doc.bankCharter?.status ?? "none",
            marker: markerOf(doc)?.status ?? "absent",
            failureEvent: event ? FAILURE_EVENT_ID : null,
          },
        ],
    notes: [
      `incident #${TICKET}: ${NAME} ${done ? "restored" : "still needs the turn-601 charter reopened"}`,
    ],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const { done, doc } = await isRestored(db);
  if (!doc)
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary: `${NAME} is gone; nothing to restore`,
    };
  if (done)
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary: `${NAME} is already restored`,
      notes: ["charter active and marker done"],
    };
  const record = await loadRecord(db);
  if (!record)
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary: `AHD-1749 ${NAME}: refused, resolution record missing`,
      notes: [`refused: resolution record ${RECORD_ID} not found`],
    };
  const built = buildReversal(record);
  if (!built.ok)
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary: `AHD-1749 ${NAME}: refused, ${built.reason}`,
      notes: [`refused: ${built.reason}`],
    };
  const r = built.reversal;
  const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2 });
  return {
    affected: 1,
    touched: [
      { collection: "corporations", ids: [CORPORATION_ID] },
      { collection: "depositInsuranceFunds", ids: [FUND_ID] },
      { collection: "centralBanks", ids: [CB_ID] },
      { collection: BANK_FAILURE_EVENTS, ids: [FAILURE_EVENT_ID] },
    ],
    moneyDelta: SHORTFALL,
    summary: `AHD-1749 ${NAME}: reopen the turn-583 universal USD charter and mint ${money(SHORTFALL)} USD to cover its deposit shortfall`,
    notes: [
      `player book ${money(r.playerBook)} stays with the central bank; playerDeposits 0`,
      `household book ${money(r.householdBook)} USD restored as npc/total deposits`,
      `bank cash ${money(r.bankCashReversal)} + mint ${money(SHORTFALL)} = ${money(r.restoredCash)} USD cashReserves`,
      `restored equity ${r.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD = cash + loans - deposits (bonds sold at 1,002.50 above the 965.10 mark)`,
      "MINTS MONEY deliberately: funds the gap the frozen resolution left in the household book",
    ],
    payload: r,
  };
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as Reversal | undefined;
  if (!payload) return { documentsScanned: 1, documentsUpdated: 0, notes: ["nothing planned"] };
  const before = await isRestored(db);
  if (!before.doc) return { documentsScanned: 1, documentsUpdated: 0, notes: [`${NAME} is gone`] };
  if (before.done)
    return { documentsScanned: 1, documentsUpdated: 0, notes: ["already restored; no-op"] };
  const record = await loadRecord(db);
  if (!record)
    return { documentsScanned: 1, documentsUpdated: 0, notes: [`refused: ${RECORD_ID} missing`] };
  const rebuilt = buildReversal(record);
  if (!rebuilt.ok)
    return { documentsScanned: 1, documentsUpdated: 0, notes: [`refused: ${rebuilt.reason}`] };
  const r = rebuilt.reversal;
  if (
    Math.abs(r.playerBook - payload.playerBook) > 1e-6 ||
    Math.abs(r.householdBook - payload.householdBook) > 1e-6 ||
    Math.abs(r.bankCashReversal - payload.bankCashReversal) > 1e-6 ||
    Math.abs(r.fundCredit - payload.fundCredit) > 1e-6
  )
    return {
      documentsScanned: 1,
      documentsUpdated: 0,
      notes: ["refused: frozen record no longer matches the approved plan"],
    };

  const id = new ObjectId(CORPORATION_ID);
  const turn =
    (
      await db
        .collection<{ _id: string; currentTurn?: number }>("gameState")
        .findOne({ _id: "current" }, { projection: { currentTurn: 1 } })
    )?.currentTurn ?? 0;

  // Claim the marker BEFORE the money moves; the journal key is the second
  // at-most-once guard, and a crash resumes from the journal rather than paying twice.
  await db.collection<CorpDoc>("corporations").updateOne(
    { _id: id, [`${MARKER_PATH}.status`]: { $ne: "done" } },
    {
      $set: {
        [MARKER_PATH]: { ticket: TICKET, shortfall: SHORTFALL, status: "pending" },
        updatedAt: ctx.now,
      },
    }
  );

  const legs = [
    {
      kind: "debit" as const,
      amount: r.householdBook,
      collection: "centralBanks",
      filter: { _id: CB_ID },
      path: "externalBroadMoney",
      note: "household deposit book returns to the reopened bank",
    },
    {
      kind: "credit" as const,
      amount: r.bankCashReversal,
      collection: "corporations",
      filter: { _id: id },
      path: "bankCharter.cashReserves",
      note: "bank cash restored, less the player book the central bank holds",
    },
    {
      kind: "credit" as const,
      amount: r.fundCredit,
      collection: "depositInsuranceFunds",
      filter: { _id: FUND_ID },
      path: "balance",
      note: "deposit insurance fund payout returned",
    },
    ...(r.treasury
      ? [
          {
            kind: "credit" as const,
            amount: r.treasury.amount,
            collection: r.treasury.collection,
            filter: r.treasury.filter,
            path: r.treasury.path,
            note: "treasury backstop returned",
          },
        ]
      : []),
    {
      kind: "mint" as const,
      amount: SHORTFALL,
      note: "game mint covers the frozen resolution shortfall",
    },
    {
      kind: "credit" as const,
      amount: SHORTFALL,
      collection: "corporations",
      filter: { _id: id },
      path: "bankCharter.cashReserves",
      note: "minted shortfall funds the restored household book",
    },
  ];

  const projections: Parameters<typeof settleTransition>[1]["projections"] = [
    {
      collection: "corporations",
      filter: { _id: id },
      update: {
        $set: {
          "bankCharter.status": "active",
          "bankCharter.type": "universal",
          "bankCharter.postedCapital": POSTED_CAPITAL,
          "bankCharter.cashReserves": r.restoredCash,
          "bankCharter.npcDeposits": r.householdBook,
          "bankCharter.playerDeposits": 0,
          "bankCharter.totalDeposits": r.householdBook,
          "bankCharter.totalLoans": TOTAL_LOANS,
          "bankCharter.sovereignTreasuryMarkValue": 0,
          "bankCharter.reserveFloor": 0,
          [`${MARKER_PATH}.status`]: "done",
          [`${MARKER_PATH}.ticket`]: TICKET,
          [`${MARKER_PATH}.shortfall`]: SHORTFALL,
          updatedAt: ctx.now,
        },
        $unset: {
          "bankCharter.failedTurn": "",
          "bankCharter.revokedTurn": "",
          "bankCharter.revokedReason": "",
          "bankCharter.pendingRevocationReason": "",
          "bankCharter.resolutionClaimedTurn": "",
          "bankCharter.depositorsResolvedTurn": "",
          "bankCharter.insuranceResolutionTurn": "",
          "bankCharter.insuranceMeasuredClaimTurn": "",
          "bankCharter.capitalStanding": "",
          "bankCharter.capitalRatio": "",
          "bankCharter.stressedCapitalRatio": "",
          "bankCharter.appliedStressLossFraction": "",
          "bankCharter.undercapitalizedSinceTurn": "",
          "bankCharter.warningBand": "",
        },
      },
      note: "reopen the old universal charter and mark the remediation done",
    },
  ];

  const fundInc: Record<string, number> = {};
  for (const [path, amount] of Object.entries(r.fundCounters))
    if (amount !== 0) fundInc[path] = -amount;
  if (Object.keys(fundInc).length > 0)
    projections.push({
      collection: "depositInsuranceFunds",
      filter: { _id: FUND_ID },
      update: { $inc: fundInc },
      note: "reverse the fund payout counters",
    });
  if (r.treasuryCounters) {
    const inc: Record<string, number> = {};
    for (const [path, amount] of Object.entries(r.treasuryCounters.inc))
      if (amount !== 0) inc[path] = -amount;
    if (Object.keys(inc).length > 0)
      projections.push({
        collection: r.treasuryCounters.collection,
        filter: r.treasuryCounters.filter,
        update: { $inc: inc },
        note: "reverse the treasury backstop spending",
      });
  }

  const settled = await settleTransition(db, {
    key: MOVE_KEY,
    kind: "bank_restoration",
    turn,
    currency: CURRENCY,
    legs,
    projections,
    event: {
      kind: "bank.resolved",
      command: "remediation.monroe_restoration",
      statusBefore: before.doc.bankCharter?.status,
      statusAfter: "active",
      amount: r.householdBook,
    },
  });
  if (settled.status === "rejected" || settled.status === "partial")
    return {
      documentsScanned: 1,
      documentsUpdated: 0,
      notes: [`restoration ${settled.status}: ${settled.error ?? "no detail"}`],
    };

  // TransitionProjection has no delete form. The failure is reversed, so the
  // political event must not keep weighing on approval. Guarded by _id, and a
  // second run simply deletes nothing.
  const deleted = await db
    .collection<{ _id: string }>(BANK_FAILURE_EVENTS)
    .deleteOne({ _id: FAILURE_EVENT_ID });

  const existing = await db
    .collection("financialTxLog")
    .findOne({ type: "restitution_credit", subjectId: id, "meta.defectId": DEFECT_ID });
  if (!existing) {
    const entry: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged"> = {
      type: "restitution_credit" as const,
      turn,
      createdAt: ctx.now,
      subjectType: "corporation" as const,
      subjectId: id,
      subjectName: NAME,
      amount: SHORTFALL,
      currencyCode: CURRENCY,
      anchorAmount: SHORTFALL,
      meta: {
        ticket: TICKET,
        defectId: DEFECT_ID,
        runId: ctx.runId ?? null,
        kind: "failed_bank_charter_restoration_shortfall",
        fundedBy: "game_mint",
      },
    };
    await emitTxBulk(db, [entry], await loadTxThresholds(db));
  }

  const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2 });
  return {
    documentsScanned: 1,
    documentsUpdated: 1,
    notes: [
      `restored ${NAME} as a universal USD bank with ${money(r.restoredCash)} USD cash and ${money(r.householdBook)} USD household deposits`,
      `minted ${money(SHORTFALL)} USD; corporation liquidCapital untouched`,
      deleted.deletedCount > 0
        ? `deleted failure political event ${FAILURE_EVENT_ID}`
        : "failure political event already absent",
    ],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const { done, doc, event } = await isRestored(db);
  return {
    ok: done,
    remaining: done ? 0 : 1,
    notes: [
      `charter ${doc?.bankCharter?.status ?? "none"}`,
      `marker ${markerOf(doc)?.status ?? "absent"}`,
      `failure event ${event ? "present" : "absent"}`,
    ],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title:
    "Monroe Indrustry's bank failed with a frozen deposit resolution: reopen the old charter and mint the shortfall",
  severity: "P1",
  seedFix: {
    status: "not-needed",
    note: "runtime charters, insurance payouts and failure events; seeds create none of them",
  },
  envs: ["prod"],
  idempotent: true,
  mintsMoney: true,
  guards: ["turn-lock-free", "max-affected:2"],
  detect,
  plan,
  apply,
  verify,
};
