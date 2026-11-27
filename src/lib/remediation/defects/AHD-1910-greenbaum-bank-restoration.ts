import { ObjectId, type Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import { settleTransition } from "@/lib/banking/settlementJournal";
import { BANK_FAILURE_EVENTS } from "@/lib/banking/failurePolitics";
import { loanCharterEpochFilter } from "@/lib/banking/loanEpoch";
import type {
  Defect,
  DetectResult,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { bankFailurePoliticalEventsCollection } from "@/lib/db/repositories/bankFailurePoliticalEvents";

// The bank was closed by the instant net-asset rule after matured bills were
// marked twice and its owner was allowed to withdraw against the inflated
// equity. Reverse the frozen resolution: households hand back the cash they
// were repaid and get their deposits back, the insurance fund and treasury
// get their payouts back, and loan repayments the fund collected since the
// closure return to the bank. The owner-approved restitution mints the gap
// that remains, so the bank reopens with zero net assets. The central bank
// advance stays repaid: retired cash against retired debt leaves equity
// unchanged. Every amount is read from the frozen records or live state.

export const DEFECT_ID = "AHD-1910-greenbaum-bank-restoration";
/** Owner-approved ceiling on the restitution, in CAD. */
export const RESTITUTION_CEILING = 26_610_000;

const MARKER_PATH = `remediation.${DEFECT_ID}`;
const TICKET = 1910;
const CURRENCY: CurrencyCode = "CAD";
const FUND_ID = "CAD";
const CB_ID = "CA";
const BUDGET_ID = "CA";
const CORPORATION_ID = "6afa8647be03f6a256650f3d";
const NAME = "Greenbaum Group";
const CHARTERED_TURN = 184;
const FAILED_TURN = 229;
const RECORD_ID = `deposit-book-return:${CORPORATION_ID}:failure:${FAILED_TURN}`;
const RECEIPT_PREFIX = `dead-bank-loan-service-batch:${CORPORATION_ID}:${CHARTERED_TURN}:`;
const FAILURE_EVENT_ID = `bank-failure:${CORPORATION_ID}:${CHARTERED_TURN}`;
const MOVE_KEY = `remediation:${DEFECT_ID}:${CORPORATION_ID}`;
const CENT = 0.01;

interface FrozenLeg {
  kind?: string;
  amount?: number;
  collection?: string;
  path?: string;
  note?: string;
}
interface FrozenRecord {
  _id: string;
  status?: string;
  legs?: FrozenLeg[];
  projections?: {
    projection?: { collection?: string; update?: Record<string, unknown> };
  }[];
}
interface Marker {
  ticket: number;
  restitution: number;
  status: "pending" | "done";
}
type CorpDoc = {
  _id: ObjectId;
  name?: string;
  bankCharter?: {
    status?: string;
    charteredTurn?: number;
    failedTurn?: number;
    cashReserves?: number;
  };
  remediation?: Record<string, unknown>;
};

/** Everything apply() writes, frozen at plan time and re-derived at apply time. */
export interface Restoration {
  householdBook: number;
  bankCashReversal: number;
  fundCredit: number;
  treasuryCredit: number;
  fundCounters: Record<string, number>;
  treasuryCounters: Record<string, number>;
  receiptIds: string[];
  receipts: number;
  totalLoans: number;
  restitution: number;
  restoredCash: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const money = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function incOf(update: Record<string, unknown> | undefined): Record<string, number> {
  const inc = update?.$inc;
  if (!inc || typeof inc !== "object") return {};
  const out: Record<string, number> = {};
  for (const [path, value] of Object.entries(inc))
    if (typeof value === "number" && Number.isFinite(value)) out[path] = value;
  return out;
}

function negated(inc: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [path, amount] of Object.entries(inc)) if (amount !== 0) out[path] = -amount;
  return out;
}

async function load(db: Db): Promise<CorpDoc | null> {
  return corporationsCollection<CorpDoc>(db).findOne(
    { _id: new ObjectId(CORPORATION_ID) },
    { projection: { name: 1, bankCharter: 1, remediation: 1 } }
  );
}

const markerOf = (doc: CorpDoc | null): Marker | undefined => {
  const v = doc?.remediation?.[DEFECT_ID];
  return v && typeof v === "object" ? (v as Marker) : undefined;
};

/** Still the closed turn-229 charter with an empty vault: the only state this repairs. */
function isClosedEstate(doc: CorpDoc | null): boolean {
  const charter = doc?.bankCharter;
  return (
    charter?.status === "failed" &&
    charter.charteredTurn === CHARTERED_TURN &&
    charter.failedTurn === FAILED_TURN &&
    Math.abs(num(charter.cashReserves)) <= CENT
  );
}

async function eventExists(db: Db): Promise<boolean> {
  return Boolean(
    await bankFailurePoliticalEventsCollection<{ _id: string }>(db).findOne(
      { _id: FAILURE_EVENT_ID },
      { projection: { _id: 1 } }
    )
  );
}

/** Split the frozen resolution into what each payer gave the households. */
export function readResolution(record: FrozenRecord):
  | {
      ok: true;
      householdBook: number;
      bankCashReversal: number;
      fundCredit: number;
      treasuryCredit: number;
      fundCounters: Record<string, number>;
      treasuryCounters: Record<string, number>;
    }
  | { ok: false; reason: string } {
  if (record.status !== "applied")
    return { ok: false, reason: `resolution record is ${record.status ?? "missing status"}` };
  let bankCashDebit = 0;
  let burned = 0;
  let fundDebit = 0;
  let treasuryDebit = 0;
  let payout = 0;
  for (const leg of record.legs ?? []) {
    const amount = num(leg.amount);
    if (!(amount > 0)) return { ok: false, reason: `leg "${leg.note ?? "?"}" has no amount` };
    if (leg.kind === "burn") burned += amount;
    else if (leg.kind === "debit" && leg.collection === "corporations") bankCashDebit += amount;
    else if (leg.kind === "debit" && leg.collection === "depositInsuranceFunds")
      fundDebit += amount;
    else if (
      leg.kind === "debit" &&
      leg.collection === "federalBudget" &&
      leg.path === "treasuryCashLocal"
    )
      treasuryDebit += amount;
    else if (leg.kind === "credit" && leg.collection === "centralBanks") payout += amount;
    else return { ok: false, reason: `unhandled ${leg.kind} leg ${leg.collection}.${leg.path}` };
  }
  const bankCashReversal = payout - fundDebit - treasuryDebit;
  // The burn retired the central bank advance from the vault; it is not
  // household money and stays retired.
  if (Math.abs(bankCashDebit - burned - bankCashReversal) > CENT)
    return { ok: false, reason: "bank cash debits less the burn do not match the payout" };
  if (!(payout > 0) || !(bankCashReversal > 0))
    return { ok: false, reason: "resolution record has no household payout" };
  let fundCounters: Record<string, number> = {};
  const treasuryCounters: Record<string, number> = {};
  for (const entry of record.projections ?? []) {
    const p = entry.projection;
    if (p?.collection === "depositInsuranceFunds") fundCounters = incOf(p.update);
    if (p?.collection === "federalBudget")
      for (const [path, amount] of Object.entries(incOf(p.update)))
        treasuryCounters[path] = (treasuryCounters[path] ?? 0) + amount;
  }
  return {
    ok: true,
    householdBook: payout,
    bankCashReversal,
    fundCredit: fundDebit,
    treasuryCredit: treasuryDebit,
    fundCounters,
    treasuryCounters,
  };
}

/** Loan repayments the insurance fund collected for this estate since the closure. */
async function loadReceipts(db: Db): Promise<{ ids: string[]; total: number }> {
  const rows = await bankMoneyMovesCollection<{
    _id: string;
    status?: string;
    legs?: FrozenLeg[];
  }>(db)
    .find(
      { _id: { $regex: `^${RECEIPT_PREFIX}` }, status: "applied" },
      { projection: { _id: 1, status: 1, legs: 1 } }
    )
    .toArray();
  let total = 0;
  const ids: string[] = [];
  for (const row of rows) {
    const credited = (row.legs ?? [])
      .filter((leg) => leg.kind === "credit" && leg.collection === "depositInsuranceFunds")
      .reduce((sum, leg) => sum + num(leg.amount), 0);
    if (credited <= 0) continue;
    ids.push(row._id);
    total += credited;
  }
  return { ids: ids.sort(), total };
}

async function loadLoanBook(db: Db): Promise<number> {
  const rows = await bankLoansCollection<{ outstanding?: number }>(db)
    .find(
      {
        bankCorporationId: new ObjectId(CORPORATION_ID),
        status: { $in: ["current", "arrears"] },
        ...loanCharterEpochFilter(CHARTERED_TURN),
      },
      { projection: { outstanding: 1 } }
    )
    .toArray();
  return rows.reduce((sum, row) => sum + Math.max(0, num(row.outstanding)), 0);
}

async function buildRestoration(
  db: Db
): Promise<{ ok: true; restoration: Restoration } | { ok: false; reason: string }> {
  const record = await bankMoneyMovesCollection<FrozenRecord>(db).findOne({ _id: RECORD_ID });
  if (!record) return { ok: false, reason: `resolution record ${RECORD_ID} missing` };
  const resolution = readResolution(record);
  if (!resolution.ok) return resolution;
  const [receipts, totalLoans] = await Promise.all([loadReceipts(db), loadLoanBook(db)]);
  const before = resolution.bankCashReversal + receipts.total;
  const gap = resolution.householdBook - before - totalLoans;
  const restitution = gap > 0 ? Math.ceil(gap * 100) / 100 : 0;
  if (restitution > RESTITUTION_CEILING)
    return {
      ok: false,
      reason: `gap ${money(restitution)} CAD is above the approved ${money(RESTITUTION_CEILING)} CAD`,
    };
  return {
    ok: true,
    restoration: {
      householdBook: resolution.householdBook,
      bankCashReversal: resolution.bankCashReversal,
      fundCredit: resolution.fundCredit,
      treasuryCredit: resolution.treasuryCredit,
      fundCounters: resolution.fundCounters,
      treasuryCounters: resolution.treasuryCounters,
      receiptIds: receipts.ids,
      receipts: receipts.total,
      totalLoans,
      restitution,
      restoredCash: before + restitution,
    },
  };
}

function sameRestoration(a: Restoration, b: Restoration): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6;
  return (
    close(a.householdBook, b.householdBook) &&
    close(a.bankCashReversal, b.bankCashReversal) &&
    close(a.fundCredit, b.fundCredit) &&
    close(a.treasuryCredit, b.treasuryCredit) &&
    close(a.receipts, b.receipts) &&
    close(a.totalLoans, b.totalLoans) &&
    close(a.restitution, b.restitution) &&
    a.receiptIds.join(",") === b.receiptIds.join(",")
  );
}

async function state(db: Db): Promise<{ done: boolean; doc: CorpDoc | null; event: boolean }> {
  const [doc, event] = await Promise.all([load(db), eventExists(db)]);
  return {
    done: markerOf(doc)?.status === "done" && doc?.bankCharter?.status === "active" && !event,
    doc,
    event,
  };
}

async function detect(db: Db): Promise<DetectResult> {
  const { done, doc, event } = await state(db);
  if (!doc) return { affected: 0, sample: [], notes: [`${NAME} is gone; nothing to restore`] };
  const affected = !done && isClosedEstate(doc) ? 1 : 0;
  return {
    affected,
    sample: affected
      ? [
          {
            charter: doc.bankCharter?.status ?? "none",
            failedTurn: doc.bankCharter?.failedTurn ?? null,
            marker: markerOf(doc)?.status ?? "absent",
            failureEvent: event ? FAILURE_EVENT_ID : null,
          },
        ]
      : [],
    notes: [
      `incident #${TICKET}: ${NAME} ${done ? "restored" : affected ? "needs the turn-229 charter reopened" : "is not in the closed turn-229 state"}`,
    ],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const { done, doc } = await state(db);
  const nothing = (summary: string, notes: string[] = []): HealPlan => ({
    affected: 0,
    touched: [],
    moneyDelta: 0,
    summary,
    notes,
  });
  if (!doc) return nothing(`${NAME} is gone; nothing to restore`);
  if (done) return nothing(`${NAME} is already restored`);
  if (!isClosedEstate(doc))
    return nothing(`AHD-1910 ${NAME}: refused, charter is not the closed turn-229 estate`, [
      `status ${doc.bankCharter?.status ?? "none"}, chartered ${doc.bankCharter?.charteredTurn ?? "?"}, cash ${money(num(doc.bankCharter?.cashReserves))}`,
    ]);
  const built = await buildRestoration(db);
  if (!built.ok) return nothing(`AHD-1910 ${NAME}: refused`, [`refused: ${built.reason}`]);
  const r = built.restoration;
  const equity = r.restoredCash + r.totalLoans - r.householdBook;
  return {
    affected: 1,
    touched: [
      { collection: "corporations", ids: [CORPORATION_ID] },
      { collection: "depositInsuranceFunds", ids: [FUND_ID] },
      { collection: "centralBanks", ids: [CB_ID] },
      { collection: "federalBudget", ids: [BUDGET_ID] },
      { collection: BANK_FAILURE_EVENTS, ids: [FAILURE_EVENT_ID] },
    ],
    moneyDelta: r.restitution,
    summary: `AHD-1910 ${NAME}: reopen the turn-229 universal CAD charter and mint ${money(r.restitution)} CAD of owner-approved restitution`,
    notes: [
      `households return ${money(r.householdBook)} CAD and get the same deposits back`,
      `bank cash ${money(r.bankCashReversal)} + loan repayments since closure ${money(r.receipts)} (${r.receiptIds.length} batches) + restitution ${money(r.restitution)} = ${money(r.restoredCash)} CAD`,
      `insurance fund gets back ${money(r.fundCredit)} CAD and pays the bank the ${money(r.receipts)} CAD it collected; treasury gets back ${money(r.treasuryCredit)} CAD`,
      `loan book ${money(r.totalLoans)} CAD; restored net assets ${money(equity)} CAD`,
      "central bank advance stays repaid; MINTS MONEY deliberately for the approved restitution",
    ],
    payload: r,
  };
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as Restoration | undefined;
  const refused = (note: string): HealResult => ({
    documentsScanned: 1,
    documentsUpdated: 0,
    notes: [note],
  });
  if (!payload) return refused("nothing planned");
  const before = await state(db);
  if (!before.doc) return refused(`${NAME} is gone`);
  if (before.done) return refused("already restored; no-op");
  const pendingMarker = markerOf(before.doc)?.status === "pending";
  if (!pendingMarker && !isClosedEstate(before.doc))
    return refused("refused: charter is no longer the closed turn-229 estate");
  const rebuilt = pendingMarker
    ? { ok: true as const, restoration: payload }
    : await buildRestoration(db);
  if (!rebuilt.ok) return refused(`refused: ${rebuilt.reason}`);
  const r = rebuilt.restoration;
  if (!sameRestoration(r, payload))
    return refused("refused: live values moved since the plan; plan again");

  const id = new ObjectId(CORPORATION_ID);
  const turn =
    (
      await gameStateCollection<{ _id: string; currentTurn?: number }>(db).findOne(
        { _id: "current" },
        { projection: { currentTurn: 1 } }
      )
    )?.currentTurn ?? 0;
  // Claim the marker BEFORE the money moves. The journal key is the second
  // at-most-once guard: a crash resumes the same transition, never a new one.
  await corporationsCollection<CorpDoc>(db).updateOne(
    { _id: id, [`${MARKER_PATH}.status`]: { $ne: "done" } },
    {
      $set: {
        [MARKER_PATH]: { ticket: TICKET, restitution: r.restitution, status: "pending" },
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
      note: "households hand back the repaid cash for their restored deposits",
    },
    {
      kind: "credit" as const,
      amount: r.bankCashReversal,
      collection: "corporations",
      filter: { _id: id },
      path: "bankCharter.cashReserves",
      note: "bank's own share of the repayment returns to the vault",
    },
    {
      kind: "credit" as const,
      amount: r.fundCredit,
      collection: "depositInsuranceFunds",
      filter: { _id: FUND_ID },
      path: "balance",
      note: "deposit insurance payout returned",
    },
    {
      kind: "credit" as const,
      amount: r.treasuryCredit,
      collection: "federalBudget",
      filter: { _id: BUDGET_ID },
      path: "treasuryCashLocal",
      note: "treasury backstop returned",
    },
    ...(r.receipts > 0
      ? [
          {
            kind: "debit" as const,
            amount: r.receipts,
            collection: "depositInsuranceFunds",
            filter: { _id: FUND_ID },
            path: "balance",
            note: "loan repayments collected for the estate leave the fund",
          },
          {
            kind: "credit" as const,
            amount: r.receipts,
            collection: "corporations",
            filter: { _id: id },
            path: "bankCharter.cashReserves",
            note: "loan repayments return to the reopened bank",
          },
        ]
      : []),
    ...(r.restitution > 0
      ? [
          {
            kind: "mint" as const,
            amount: r.restitution,
            note: "owner-approved restitution for the double-counted bill mark",
          },
          {
            kind: "credit" as const,
            amount: r.restitution,
            collection: "corporations",
            filter: { _id: id },
            path: "bankCharter.cashReserves",
            note: "restitution closes the deposit gap",
          },
        ]
      : []),
  ];
  const projections: Parameters<typeof settleTransition>[1]["projections"] = [
    {
      collection: "corporations",
      filter: { _id: id },
      update: {
        $set: {
          "bankCharter.status": "active",
          "bankCharter.npcDeposits": r.householdBook,
          "bankCharter.playerDeposits": 0,
          "bankCharter.totalDeposits": r.householdBook,
          "bankCharter.totalLoans": r.totalLoans,
          "bankCharter.sovereignTreasuryMarkValue": 0,
          "bankCharter.warningBand": "green",
          "bankCharter.panicTurns": 0,
          "bankCharter.lastSolvencyTurn": turn,
          [`${MARKER_PATH}.status`]: "done",
          [`${MARKER_PATH}.ticket`]: TICKET,
          [`${MARKER_PATH}.restitution`]: r.restitution,
          updatedAt: ctx.now,
        },
        $unset: {
          "bankCharter.failedTurn": "",
          "bankCharter.resolutionClaimedTurn": "",
          "bankCharter.depositorsResolvedTurn": "",
          "bankCharter.insuranceResolutionTurn": "",
          "bankCharter.insuranceMeasuredClaimTurn": "",
          "bankCharter.reserveFloor": "",
          "bankCharter.capitalStanding": "",
          "bankCharter.capitalRatio": "",
          "bankCharter.stressedCapitalRatio": "",
          "bankCharter.undercapitalizedSinceTurn": "",
          "bankCharter.insolventSinceTurn": "",
        },
      },
      note: "reopen the turn-229 universal charter and mark the remediation done",
    },
  ];
  const fundInc = negated(r.fundCounters);
  if (Object.keys(fundInc).length > 0)
    projections.push({
      collection: "depositInsuranceFunds",
      filter: { _id: FUND_ID },
      update: { $inc: fundInc },
      note: "reverse the fund payout counters",
    });
  const treasuryInc = negated(r.treasuryCounters);
  if (Object.keys(treasuryInc).length > 0)
    projections.push({
      collection: "federalBudget",
      filter: { _id: BUDGET_ID },
      update: { $inc: treasuryInc },
      note: "reverse the treasury backstop spending",
    });
  const settled = await settleTransition(db, {
    key: MOVE_KEY,
    kind: "bank_restoration",
    turn,
    currency: CURRENCY,
    legs,
    projections,
    event: {
      kind: "bank.resolved",
      command: "remediation.greenbaum_restoration",
      statusBefore: before.doc.bankCharter?.status,
      statusAfter: "active",
      amount: r.householdBook,
    },
  });
  if (settled.status === "rejected" || settled.status === "partial")
    return refused(`restoration ${settled.status}: ${settled.error ?? "no detail"}`);

  // The closure is reversed, so its political hit must not keep weighing on
  // approval. Guarded by _id; a second run deletes nothing.
  await bankFailurePoliticalEventsCollection<{ _id: string }>(db).deleteOne({
    _id: FAILURE_EVENT_ID,
  });
  if (r.restitution > 0) {
    const existing = await financialTxLogCollection(db).findOne({
      type: "restitution_credit",
      subjectId: id,
      "meta.defectId": DEFECT_ID,
    });
    if (!existing) {
      const entry: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged"> = {
        type: "restitution_credit" as const,
        turn,
        createdAt: ctx.now,
        subjectType: "corporation" as const,
        subjectId: id,
        subjectName: NAME,
        amount: r.restitution,
        currencyCode: CURRENCY,
        meta: {
          ticket: TICKET,
          defectId: DEFECT_ID,
          runId: ctx.runId ?? null,
          kind: "failed_bank_charter_restoration_gap",
          fundedBy: "game_mint",
        },
      };
      await emitTxBulk(db, [entry], await loadTxThresholds(db));
    }
  }
  return {
    documentsScanned: 1,
    documentsUpdated: 1,
    notes: [
      `${NAME} reopened with ${money(r.restoredCash)} CAD cash, ${money(r.householdBook)} CAD deposits and ${money(r.totalLoans)} CAD loans`,
      `restitution ${money(r.restitution)} CAD minted; ${r.receiptIds.length} loan repayment batches returned`,
    ],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const { done, doc, event } = await state(db);
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
    "Greenbaum Group's bank was closed after matured bills were counted twice: reopen the turn-229 charter and mint the approved gap",
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
