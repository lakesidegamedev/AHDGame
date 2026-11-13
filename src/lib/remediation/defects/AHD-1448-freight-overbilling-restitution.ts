import { ObjectId, type Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import type { ExchangeRate } from "@/lib/db/types";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import type {
  Defect,
  DetectResult,
  HealPlan,
  HealResult,
  HealContext,
  VerifyResult,
} from "../types";
import {
  FREIGHT_OVERBILLING_WINDOW,
  FREIGHT_OVERBILLING_BY_CORPORATION,
} from "./AHD-1448-freight-overbilling-restitution.data";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";

/**
 * Restitution for freight overbilling: the sourcing pass settles the commodity
 * ledger in units-per-day, so `sourcingNetworkLoad` freight bills are daily
 * money, but `resolveSectorFreightBillingLegs` charged the full daily amount on
 * every hourly turn, overcharging 23/24 of each day's bill.
 *
 * Credits every overcharged corporation once. The matching surplus paid to
 * logistics haulers is deliberately NOT clawed back, so this is an intentional
 * mint. The credit is the gross overcharge, not netted for any tax saving.
 *
 * Amounts live in the companion data file, not recomputed here, because no
 * per-sector freight history was persisted. They were rebuilt offline from the
 * 50 `sourcingNetworkLoad` documents (corporation turns 29 to 78) by re-running
 * each turn's own `apportionFreightBilling`. Sectors use current demand units,
 * so early turns are an estimate; the rebuild of the last document matched
 * 371 of 503 sectors within 5%, aggregate within 0.6%.
 */
export const DEFECT_ID = "AHD-1448-freight-overbilling-restitution";

const MARKER_PATH = `remediation.${DEFECT_ID}`;

interface CorporationDoc {
  _id: ObjectId;
  name?: string;
  countryId?: string;
  liquidCurrencyCode?: CurrencyCode | null;
  remediation?: Record<string, unknown>;
}

interface PlannedCredit {
  corporationId: string;
  corporationName: string;
  creditAnchor: number;
  currencyCode: CurrencyCode;
  /** Local currency per 1 anchor at heal time; 1 for pre-forex corporations. */
  fxRate: number;
  creditLocal: number;
}

interface Payload {
  credits: PlannedCredit[];
  totalAnchor: number;
}

/** Total anchor this heal mints, before skipping corporations that are gone or done. */
export function pinnedTotalAnchor(): number {
  return FREIGHT_OVERBILLING_BY_CORPORATION.reduce((sum, row) => sum + row.overchargeAnchor, 0);
}

function hasMarker(doc: CorporationDoc | undefined): boolean {
  return Boolean(doc?.remediation?.[DEFECT_ID]);
}

async function loadCorporations(db: Db): Promise<Map<string, CorporationDoc>> {
  const ids = FREIGHT_OVERBILLING_BY_CORPORATION.map((row) => new ObjectId(row.corporationId));
  const docs = await corporationsCollection<CorporationDoc>(db)
    .find(
      { _id: { $in: ids } },
      { projection: { name: 1, countryId: 1, liquidCurrencyCode: 1, remediation: 1 } }
    )
    .toArray();
  return new Map(docs.map((doc) => [doc._id.toString(), doc]));
}

async function loadRatesByCurrency(db: Db): Promise<Map<string, number>> {
  const rates = await exchangeRatesCollection(db).find({}).toArray();
  return new Map(rates.map((rate) => [String(rate.currencyCode), rate.rate]));
}

/** Where one corporation's credit lands, or null when it is gone or already credited. */
export function planCorporationCredit(
  row: { corporationId: string; overchargeAnchor: number },
  doc: CorporationDoc | undefined,
  ratesByCurrency: Map<string, number>
): PlannedCredit | null {
  if (!doc || hasMarker(doc) || !(row.overchargeAnchor > 0)) return null;
  // Pre-forex corps carry no `liquidCurrencyCode` and hold `liquidCapital` in
  // anchor, so rate 1 keeps the written amount and the receipt consistent.
  const liquidCurrency = doc.liquidCurrencyCode ?? null;
  const currencyCode = liquidCurrency ?? getHomeCurrency({ countryId: doc.countryId ?? "US" });
  const fxRate = liquidCurrency ? (ratesByCurrency.get(currencyCode) ?? 0) : 1;
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null;
  return {
    corporationId: row.corporationId,
    corporationName: doc.name ?? "",
    creditAnchor: row.overchargeAnchor,
    currencyCode,
    fxRate,
    creditLocal: row.overchargeAnchor * fxRate,
  };
}

async function buildPlannedCredits(db: Db): Promise<PlannedCredit[]> {
  const [corporations, rates] = await Promise.all([loadCorporations(db), loadRatesByCurrency(db)]);
  return FREIGHT_OVERBILLING_BY_CORPORATION.map((row) =>
    planCorporationCredit(row, corporations.get(row.corporationId), rates)
  ).filter((planned): planned is PlannedCredit => planned !== null);
}

async function detect(db: Db): Promise<DetectResult> {
  const planned = await buildPlannedCredits(db);
  return {
    affected: planned.length,
    sample: [...planned]
      .sort((a, b) => b.creditAnchor - a.creditAnchor)
      .slice(0, 10)
      .map((credit) => ({
        corporationId: credit.corporationId,
        corporationName: credit.corporationName,
        creditAnchor: credit.creditAnchor,
        currencyCode: credit.currencyCode,
        creditLocal: credit.creditLocal,
      })),
    notes: [
      `${FREIGHT_OVERBILLING_BY_CORPORATION.length} overcharged corporations pinned for corporation turns ${FREIGHT_OVERBILLING_WINDOW.firstCorpTurn} to ${FREIGHT_OVERBILLING_WINDOW.lastCorpTurn}`,
      planned.length === 0
        ? "every corporation already carries the AHD-1448 marker, or is no longer present"
        : `${planned.length} corporations still owe a credit`,
    ],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const credits = await buildPlannedCredits(db);
  const totalAnchor = credits.reduce((sum, credit) => sum + credit.creditAnchor, 0);
  if (credits.length === 0) {
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary: "AHD-1448: nothing to credit (every corporation already credited, or gone)",
    };
  }
  return {
    affected: credits.length,
    touched: [{ collection: "corporations", ids: credits.map((credit) => credit.corporationId) }],
    moneyDelta: totalAnchor,
    summary: `AHD-1448: credit ${Math.round(totalAnchor).toLocaleString("en-US")} anchor across ${credits.length} corporations for freight billed 24 times a day on corporation turns ${FREIGHT_OVERBILLING_WINDOW.firstCorpTurn} to ${FREIGHT_OVERBILLING_WINDOW.lastCorpTurn}`,
    notes: [
      "per corporation: 23/24 of every apportioned daily freight charge over the window, rebuilt per sourcing document, gross of tax",
      "converted to the corporation's settlement currency at the current rate",
      "logistics haulers keep the surplus they were paid (owner decision), so this MINTS MONEY deliberately",
      "each credit emits a restitution_credit tx row, so the shadow ledger books an attributed mint",
    ],
    payload: { credits, totalAnchor } satisfies Payload,
  };
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as Payload | undefined;
  const credits = payload?.credits ?? [];
  if (credits.length === 0) {
    return { documentsScanned: 0, documentsUpdated: 0, notes: ["nothing to credit"] };
  }

  const applied: PlannedCredit[] = [];
  for (const credit of credits) {
    // Marker and increment in ONE update, under a filter that demands the
    // marker's absence, so a concurrent or repeated run credits nobody twice.
    const res = await corporationsCollection(db).updateOne(
      { _id: new ObjectId(credit.corporationId), [MARKER_PATH]: { $exists: false } },
      {
        $inc: { liquidCapital: credit.creditLocal },
        $set: {
          [MARKER_PATH]: {
            ticket: 1448,
            creditedAt: ctx.now,
            creditAnchor: credit.creditAnchor,
            creditLocal: credit.creditLocal,
            currencyCode: credit.currencyCode,
            fxRate: credit.fxRate,
            window: FREIGHT_OVERBILLING_WINDOW,
            runId: ctx.runId ?? null,
          },
          updatedAt: ctx.now,
        },
      }
    );
    if (res.modifiedCount === 1) applied.push(credit);
  }

  if (applied.length > 0) {
    const thresholds = await loadTxThresholds(db);
    await emitTxBulk(
      db,
      applied.map((credit) => ({
        type: "restitution_credit" as const,
        turn: FREIGHT_OVERBILLING_WINDOW.lastCorpTurn,
        createdAt: ctx.now,
        subjectType: "corporation" as const,
        subjectId: new ObjectId(credit.corporationId),
        subjectName: credit.corporationName,
        amount: credit.creditLocal,
        currencyCode: credit.currencyCode,
        anchorAmount: credit.creditAnchor,
        meta: {
          ticket: 1448,
          defectId: DEFECT_ID,
          runId: ctx.runId ?? null,
          firstCorpTurn: FREIGHT_OVERBILLING_WINDOW.firstCorpTurn,
          lastCorpTurn: FREIGHT_OVERBILLING_WINDOW.lastCorpTurn,
          fxRate: credit.fxRate,
        },
      })),
      thresholds
    );
  }

  // emitTxBulk mints its own ids: read them back so a rollback can delete them.
  const insertedTxIds = ctx.runId
    ? await financialTxLogCollection(db)
        .find({ type: "restitution_credit", "meta.runId": ctx.runId }, { projection: { _id: 1 } })
        .toArray()
    : [];

  return {
    documentsScanned: credits.length,
    documentsUpdated: applied.length,
    insertedIds:
      insertedTxIds.length > 0
        ? [{ collection: "financialTxLog", ids: insertedTxIds.map((doc) => doc._id.toString()) }]
        : undefined,
    notes: [
      `credited ${applied.length} of ${credits.length} corporations`,
      `emitted ${insertedTxIds.length} restitution_credit receipts`,
    ],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const after = await detect(db);
  const corporations = await loadCorporations(db);
  const marked = FREIGHT_OVERBILLING_BY_CORPORATION.filter((row) =>
    hasMarker(corporations.get(row.corporationId))
  ).length;
  return {
    ok: after.affected === 0,
    remaining: after.affected,
    notes: [
      `${marked} of ${FREIGHT_OVERBILLING_BY_CORPORATION.length} corporations carry the AHD-1448 marker`,
      after.affected === 0
        ? "detector is clean: a re-run credits nobody"
        : `${after.affected} corporations still uncredited`,
    ],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title: "Freight was billed a full day's bill on every hourly turn",
  severity: "P1",
  codeFix: {
    pr: 3758,
    mergedTo: "main",
    // The squash commit on development; promotions are merge commits, so it is
    // an ancestor of every main build that carries the fix.
    requiredCommit: "823abf1cb5ca389b162c5f00c20865bfa5c448ff",
  },
  seedFix: {
    status: "not-needed",
    note: "runtime unit-basis bug in the corporation turn, not authored seed data; a fresh world bills correctly once the fix is deployed",
  },
  envs: ["prod"],
  // Pinned corporation ids and turns recur in later worlds.
  worldsStartedBefore: "2026-11-12T00:00:00.000Z",
  idempotent: true,
  // Deliberate: repays freight a unit bug overcharged, without clawing back the
  // haulers' matching surplus (owner decision), so the conservation guard is omitted.
  mintsMoney: true,
  guards: ["turn-lock-free", "max-affected:400"],
  detect,
  plan,
  apply,
  verify,
};
