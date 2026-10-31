/**
 * Shell for the state operating advance on a funded producer turn (see
 * stateRunAdvanceRules). Before the market plans, the owning treasury advances
 * each state company the gap between its cash and its full run; right after
 * settlement the company returns whatever of that advance it still holds.
 *
 * Both legs are durable, keyed settlements, so a retried turn replays the
 * frozen amounts instead of re-pricing them from cash the first attempt already
 * moved. The treasury side follows the existing SOE loss backing: with funded
 * Treasury cash it is a guarded transfer from spendable cash, otherwise the
 * signed `treasuryBalance` moves unconditionally (soft budget: a treasury that
 * cannot afford it goes into debt rather than leaving the plants idle).
 */
import { ObjectId, type Db } from "mongodb";
import * as Sentry from "@sentry/nextjs";
import type { Corporation, FederalBudget } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { settleTransition } from "@/lib/banking/settlementJournal";
import type { BankingTransition, TransitionLeg } from "@/lib/banking/rules/boundary";
import { writeGovBudgetLocal } from "@/lib/currency/govBudgetFields";
import {
  resolveTreasuryCashOptions,
  witnessTreasuryCash,
  type TreasuryCashOptions,
} from "@/lib/nationalization/treasuryLedger";
import { snapshotCorporationCurrency } from "@/lib/ledger/balanceSnapshot";
import type { ProducerPayable } from "@/lib/market/producerMarket/payablesRules";
import type { ProductionPlan } from "@/lib/market/producerMarket/production";
import {
  stateRunAdvanceReturn,
  stateRunAdvances,
} from "@/lib/market/producerMarket/stateRunAdvanceRules";

type CorpCash = Pick<
  Corporation,
  | "_id"
  | "liquidCapital"
  | "liquidCurrencyCode"
  | "producerPayables"
  | "countryOwnerId"
  | "countryId"
>;

export interface StateRunAdvanceContext {
  worldEpoch: string;
  turn: number;
  now: Date;
  /** Observed local-per-anchor rate by currency. */
  rates: ReadonlyMap<CurrencyCode, number>;
  /** Budget currency of each owning country. */
  treasuryCurrency: (countryId: string) => CurrencyCode | undefined;
  ledger?: TreasuryCashOptions;
}

/** Anchor advanced per company this turn, as frozen in its receipt. */
export type StateAdvances = Map<string, number>;

export const stateAdvanceKey = (worldEpoch: string, turn: number, corpId: string) =>
  `producer-state-advance:${worldEpoch}:${turn}:${corpId}`;
export const stateAdvanceReturnKey = (worldEpoch: string, turn: number, corpId: string) =>
  `producer-state-advance-return:${worldEpoch}:${turn}:${corpId}`;

const ownerOf = (corp: CorpCash) => String(corp.countryOwnerId ?? corp.countryId ?? "");

/**
 * The anchor value each existing receipt froze on its corporation leg, so a
 * retry settles what the first attempt priced, not what live cash says now.
 */
async function frozenAnchors(db: Db, keys: readonly string[]): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const records = await db
    .collection<{
      _id: string;
      status?: string;
      legs?: { collection?: string; amount: number; valuation?: { localPerAnchor: number } }[];
    }>(MONEY_MOVE_COLLECTION)
    .find({ _id: { $in: [...keys] } }, { projection: { status: 1, legs: 1 } })
    .toArray();
  const out = new Map<string, number>();
  for (const r of records) {
    const leg = r.legs?.find((l) => l.collection === "corporations");
    const rate = leg?.valuation?.localPerAnchor;
    out.set(r._id, r.status === "rejected" || !leg || !rate ? 0 : leg.amount / rate);
  }
  return out;
}

async function loadStateCorps(db: Db, ids: readonly string[]): Promise<CorpCash[]> {
  if (ids.length === 0) return [];
  return db
    .collection<Corporation>("corporations")
    .find(
      { _id: { $in: ids.map((id) => new ObjectId(id)) } },
      {
        projection: {
          liquidCapital: 1,
          liquidCurrencyCode: 1,
          producerPayables: 1,
          countryOwnerId: 1,
          countryId: 1,
        },
      }
    )
    .toArray();
}

/** One leg pair plus the signed fiscal projection, in either treasury mode. */
function advanceTransition(input: {
  key: string;
  kind: "producer_state_advance" | "producer_state_advance_return";
  turn: number;
  now: Date;
  corp: CorpCash;
  countryId: string;
  amountAnchor: number;
  corpRate: number;
  treasuryCurrency: CurrencyCode;
  treasuryRate: number;
  fundedTreasury: boolean;
}): { transition: BankingTransition; corpLocal: number; treasuryLocal: number } {
  const corpCurrency = input.corp.liquidCurrencyCode ?? "USD";
  const corpLocal = input.amountAnchor * input.corpRate;
  const treasuryLocal = Math.round(
    writeGovBudgetLocal(input.amountAnchor, input.treasuryCurrency, input.treasuryRate)
  );
  const toCorp = input.kind === "producer_state_advance";
  const corpLeg: TransitionLeg = {
    kind: toCorp ? "credit" : "debit",
    amount: corpLocal,
    valuation: { currencyCode: corpCurrency, localPerAnchor: input.corpRate },
    collection: "corporations",
    filter: { _id: input.corp._id },
    path: "liquidCapital",
    note: toCorp ? "state operating advance for this turn's run" : "unspent operating advance",
  };
  const treasuryValuation = {
    currencyCode: input.treasuryCurrency,
    localPerAnchor: treasuryLocal / input.amountAnchor,
  };
  // With funded Treasury cash the advance is a real transfer from spendable
  // cash. Without it the signed balance below is the only treasury account, so
  // the cash enters (and leaves) the company through a named mint and burn.
  const treasuryLeg: TransitionLeg = input.fundedTreasury
    ? {
        kind: toCorp ? "debit" : "credit",
        amount: treasuryLocal,
        valuation: treasuryValuation,
        collection: "federalBudget",
        filter: toCorp
          ? { countryId: input.countryId, treasuryCashLocal: { $gte: treasuryLocal } }
          : { countryId: input.countryId },
        path: "treasuryCashLocal",
        note: toCorp ? "advance from spendable Treasury cash" : "advance returned to Treasury cash",
      }
    : {
        kind: toCorp ? "mint" : "burn",
        amount: corpLocal,
        valuation: { currencyCode: corpCurrency, localPerAnchor: input.corpRate },
        note: toCorp
          ? "advance drawn on the owning treasury's signed balance"
          : "advance returned to the owning treasury's signed balance",
      };
  return {
    corpLocal,
    treasuryLocal,
    transition: {
      key: input.key,
      kind: input.kind,
      turn: input.turn,
      currency: corpCurrency,
      legs: toCorp ? [treasuryLeg, corpLeg] : [corpLeg, treasuryLeg],
      projections: [
        {
          collection: "federalBudget",
          filter: { countryId: input.countryId },
          update: {
            $inc: { treasuryBalance: toCorp ? -treasuryLocal : treasuryLocal },
            $set: { updatedAt: input.now },
          },
          note: "Signed fiscal position moves with the state operating advance",
        },
      ],
      event: {
        kind: "monetary.executed",
        command: "producerMarket.stateRunAdvance",
        subjectType: "government",
        subjectId: input.countryId,
        amount: treasuryLocal,
        meta: { flow: "soe_loss_backing" },
      },
    },
  };
}

/** Witness both sides like the SOE loss backing: the treasury leg only off funded cash. */
async function witness(
  db: Db,
  ledger: TreasuryCashOptions,
  corp: CorpCash,
  countryId: string,
  corpLocal: number,
  treasuryLocal: number,
  now: Date
) {
  if (!ledger.context?.treasuryCashLedgerEnabled)
    await witnessTreasuryCash(db, ledger, {
      flow: "soe_loss_backing",
      account: { kind: "government", countryId: countryId as CountryId },
      amount: treasuryLocal,
      now,
      site: "producerMarket/stateRunAdvance",
    });
  await witnessTreasuryCash(db, ledger, {
    flow: "soe_loss_backing",
    account: {
      kind: "corporation",
      corpId: corp._id.toHexString(),
      currency: snapshotCorporationCurrency(corp),
    },
    amount: corpLocal,
    now,
    site: "producerMarket/stateRunAdvance",
  });
}

async function treasuryCashByCountry(
  db: Db,
  countryIds: readonly string[]
): Promise<Map<string, number>> {
  const rows = await db
    .collection<FederalBudget>("federalBudget")
    .find(
      { countryId: { $in: [...countryIds] as CountryId[] } },
      { projection: { countryId: 1, treasuryCashLocal: 1 } }
    )
    .toArray();
  return new Map(
    rows.map((r) => [
      String(r.countryId),
      Math.max(0, (r as { treasuryCashLocal?: number }).treasuryCashLocal ?? 0),
    ])
  );
}

/**
 * Advance every state company the cash its full run needs, before the market
 * plans. Returns the anchor each company was advanced (frozen on a retry).
 */
export async function advanceStateRuns(
  db: Db,
  ctx: StateRunAdvanceContext,
  input: { plans: readonly ProductionPlan[]; stateCorpIds: ReadonlySet<string> }
): Promise<StateAdvances> {
  const advanced: StateAdvances = new Map();
  const ids = [...input.stateCorpIds].sort();
  if (ids.length === 0) return advanced;
  const corps = await loadStateCorps(db, ids);
  const frozen = await frozenAnchors(
    db,
    ids.map((id) => stateAdvanceKey(ctx.worldEpoch, ctx.turn, id))
  );
  const rateOf = (code: string | null | undefined) => {
    const r = code ? ctx.rates.get(code as CurrencyCode) : undefined;
    return r && Number.isFinite(r) && r > 0 ? r : null;
  };
  const cashByAccount = new Map<string, number>();
  const payables: ProducerPayable[] = [];
  for (const corp of corps) {
    const rate = rateOf(corp.liquidCurrencyCode);
    if (!rate) continue;
    cashByAccount.set(corp._id.toHexString(), Math.max(0, (corp.liquidCapital ?? 0) / rate));
    payables.push(...(corp.producerPayables?.claims ?? []));
  }
  const fresh = new Map(
    stateRunAdvances({
      plans: input.plans,
      payables,
      cashByAccount,
      stateAccountIds: new Set(cashByAccount.keys()),
    }).map((a) => [a.accountId, a.amount])
  );
  const ledger = await resolveTreasuryCashOptions(db, ctx.ledger);
  const fundedTreasury = ledger.context?.treasuryCashLedgerEnabled === true;
  const spendable = fundedTreasury
    ? await treasuryCashByCountry(db, [...new Set(corps.map(ownerOf))])
    : null;
  for (const corp of corps) {
    const id = corp._id.toHexString();
    const key = stateAdvanceKey(ctx.worldEpoch, ctx.turn, id);
    const replay = frozen.has(key);
    let amountAnchor = replay ? frozen.get(key)! : (fresh.get(id) ?? 0);
    const countryId = ownerOf(corp);
    const treasuryCurrency = ctx.treasuryCurrency(countryId);
    const corpRate = rateOf(corp.liquidCurrencyCode);
    const treasuryRate = treasuryCurrency ? rateOf(treasuryCurrency) : null;
    if (!(amountAnchor > 0) || !treasuryCurrency || !corpRate || !treasuryRate) continue;
    // Funded Treasury cash cannot go below zero: advance what it can spend and
    // let the run scale down on the rest, as a private company's would.
    if (spendable && !replay) {
      const left = spendable.get(countryId) ?? 0;
      const capAnchor = left / treasuryRate;
      amountAnchor = Math.min(amountAnchor, capAnchor);
      if (!(amountAnchor > 0)) continue;
    }
    const built = advanceTransition({
      key,
      kind: "producer_state_advance",
      turn: ctx.turn,
      now: ctx.now,
      corp,
      countryId,
      amountAnchor,
      corpRate,
      treasuryCurrency,
      treasuryRate,
      fundedTreasury,
    });
    if (!(built.treasuryLocal > 0)) continue;
    if (spendable && !replay)
      spendable.set(countryId, (spendable.get(countryId) ?? 0) - built.treasuryLocal);
    const result = await settleTransition(db, built.transition);
    if (result.status === "rejected" || result.status === "partial") {
      // A refused advance leaves the company on its own cash, as before this
      // change; the turn goes on rather than stopping the whole economy.
      Sentry.captureMessage("State operating advance did not settle", {
        level: "warning",
        extra: { key, status: result.status, error: result.error },
      });
      continue;
    }
    if (result.status === "applied")
      await witness(db, ledger, corp, countryId, built.corpLocal, -built.treasuryLocal, ctx.now);
    advanced.set(id, amountAnchor);
  }
  return advanced;
}

/**
 * Return each state company's unspent advance to its treasury right after
 * settlement, capped at the cash it holds. Returns the local amount each
 * company paid back, so the caller can keep its in-memory cash in step.
 */
export async function returnStateRunAdvances(
  db: Db,
  ctx: StateRunAdvanceContext,
  advances: StateAdvances
): Promise<Map<string, number>> {
  const returnedLocal = new Map<string, number>();
  const ids = [...advances.keys()].sort();
  if (ids.length === 0) return returnedLocal;
  const corps = await loadStateCorps(db, ids);
  const frozen = await frozenAnchors(
    db,
    ids.map((id) => stateAdvanceReturnKey(ctx.worldEpoch, ctx.turn, id))
  );
  const ledger = await resolveTreasuryCashOptions(db, ctx.ledger);
  const fundedTreasury = ledger.context?.treasuryCashLedgerEnabled === true;
  for (const corp of corps) {
    const id = corp._id.toHexString();
    const key = stateAdvanceReturnKey(ctx.worldEpoch, ctx.turn, id);
    const corpRate = ctx.rates.get((corp.liquidCurrencyCode ?? "USD") as CurrencyCode);
    const countryId = ownerOf(corp);
    const treasuryCurrency = ctx.treasuryCurrency(countryId);
    const treasuryRate = treasuryCurrency ? ctx.rates.get(treasuryCurrency) : undefined;
    if (!corpRate || !(corpRate > 0) || !treasuryCurrency || !treasuryRate || !(treasuryRate > 0))
      continue;
    // Floor the held cash a hair so float error cannot ask the guarded debit
    // for more than the company holds.
    const heldAnchor = Math.max(0, Math.floor(corp.liquidCapital ?? 0)) / corpRate;
    const amountAnchor = frozen.has(key)
      ? frozen.get(key)!
      : stateRunAdvanceReturn(advances.get(id) ?? 0, heldAnchor);
    if (!(amountAnchor > 0)) continue;
    const built = advanceTransition({
      key,
      kind: "producer_state_advance_return",
      turn: ctx.turn,
      now: ctx.now,
      corp,
      countryId,
      amountAnchor,
      corpRate,
      treasuryCurrency,
      treasuryRate,
      fundedTreasury,
    });
    if (!(built.treasuryLocal > 0)) continue;
    const result = await settleTransition(db, built.transition);
    if (result.status === "rejected" || result.status === "partial") {
      Sentry.captureMessage("State operating advance return did not settle", {
        level: "warning",
        extra: { key, status: result.status, error: result.error },
      });
      continue;
    }
    if (result.status === "applied") {
      await witness(db, ledger, corp, countryId, -built.corpLocal, built.treasuryLocal, ctx.now);
      returnedLocal.set(id, built.corpLocal);
    }
  }
  return returnedLocal;
}
