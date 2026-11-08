/**
 * National index funds for background countries.
 *
 * Each background country gets one ordinary index fund, created the first
 * time its kernel ticks, so players buy and sell it through the existing
 * fund subscribe and redeem routes. Its only asset is cash kept equal to NAV
 * times units; each tick marks it to the country's index level, creating or
 * withdrawing the difference against the background economy with a ledger
 * leg. The fund cron leaves its assets alone (see `isNationalIndexFund`) and
 * only serves its redemption queue and snapshots.
 *
 * Batched: a fund read, at most one insert, one queued-unit read, a fresh fund
 * read and one conditional bulk write (re-priced on a miss), one transaction insert and one ledger emission per tick.
 */
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { IndexFund, IndexFundTransaction } from "@/lib/db/types/indexFund";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { loadQueuedRedemptionUnitsByFundId } from "@/lib/indexFunds/fundValuation";
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";
import { markNationalIndexFund, nationalIndexFundIdentity } from "./rules/nationalIndex";

const MARK_ATTEMPTS = 3;
const FUND_PROJECTION = {
  slug: 1,
  name: 1,
  anchorCurrencyCode: 1,
  quotedNav: 1,
  unitSupply: 1,
  cashAnchor: 1,
  nationalIndex: 1,
} as const;
type FundRead = Pick<
  IndexFund,
  | "_id"
  | "slug"
  | "name"
  | "anchorCurrencyCode"
  | "quotedNav"
  | "unitSupply"
  | "cashAnchor"
  | "nationalIndex"
>;

export interface NationalIndexMark {
  countryId: string;
  displayName: string;
  currencyCode: string;
  nav: number;
}

function newNationalIndexFund(mark: NationalIndexMark, now: Date): IndexFund {
  const identity = nationalIndexFundIdentity(mark.countryId, mark.displayName);
  return {
    _id: new ObjectId(),
    ...identity,
    scope: "country",
    kind: "broad",
    countryId: mark.countryId as CountryId,
    anchorCurrencyCode: mark.currencyCode as CurrencyCode,
    status: "active",
    quotedNav: mark.nav,
    unitSupply: 0,
    reserveUnits: 0,
    cashAnchor: 0,
    targetConstituents: [],
    holdings: [],
    backingRatio: 1,
    nationalIndex: { entityId: mark.countryId },
    createdAt: now,
    updatedAt: now,
  };
}

/** Create missing national funds and mark the rest to this tick's NAV. */
export async function markNationalIndexFunds(
  db: Db,
  marks: readonly NationalIndexMark[],
  turn: number,
  now = new Date()
): Promise<{ created: number; marked: number }> {
  if (marks.length === 0) return { created: 0, marked: 0 };
  const funds = db.collection<IndexFund>("indexFunds");
  const existing = await funds
    .find(
      { "nationalIndex.entityId": { $in: marks.map((m) => m.countryId) } },
      { projection: FUND_PROJECTION }
    )
    .toArray();
  const byCountry = new Map(existing.map((f) => [f.nationalIndex!.entityId, f]));

  const missing = marks.filter((m) => !byCountry.has(m.countryId));
  if (missing.length > 0) {
    try {
      await funds.insertMany(
        missing.map((m) => newNationalIndexFund(m, now)),
        { ordered: false }
      );
    } catch (err) {
      // A concurrent or retried tick already created it; the slug index keeps one.
      if (!(err && typeof err === "object" && "code" in err && err.code === 11000)) throw err;
    }
  }

  let pending = marks.filter((m) => byCountry.has(m.countryId));
  const present = pending;
  if (present.length === 0) return { created: missing.length, marked: 0 };
  const queued = await loadQueuedRedemptionUnitsByFundId(
    db,
    present.map((m) => byCountry.get(m.countryId)!._id)
  );
  // A subscription can land between the read and the write. Each write is
  // conditional on the supply and NAV it was priced from; a miss is re-read
  // and re-priced, so cash always backs every unit.
  const transactions: IndexFundTransaction[] = [];
  const legs: TxInput[] = [];
  let marked = 0;
  const markAttempt = async (attempt: number): Promise<void> => {
    if (attempt >= MARK_ATTEMPTS || pending.length === 0) return;
    const fresh = await funds
      .find(
        { "nationalIndex.entityId": { $in: pending.map((m) => m.countryId) } },
        { projection: FUND_PROJECTION }
      )
      .toArray();
    for (const f of fresh) byCountry.set(f.nationalIndex!.entityId, f);
    const writes: AnyBulkWriteOperation<IndexFund>[] = [];
    const attempted: {
      mark: NationalIndexMark;
      fund: FundRead;
      cashDelta: number;
      token: string;
    }[] = [];
    for (const mark of pending) {
      const fund = byCountry.get(mark.countryId)!;
      const { cashDelta } = markNationalIndexFund({
        quotedNav: fund.quotedNav,
        newNav: mark.nav,
        unitSupply: fund.unitSupply,
        queuedUnits: queued.get(String(fund._id)) ?? 0,
        cashAnchor: fund.cashAnchor,
      });
      const token = new ObjectId().toHexString();
      attempted.push({ mark, fund, cashDelta, token });
      writes.push({
        updateOne: {
          filter: { _id: fund._id, unitSupply: fund.unitSupply, quotedNav: fund.quotedNav },
          update: {
            $set: {
              quotedNav: mark.nav,
              backingRatio: 1,
              updatedAt: now,
              "nationalIndex.markToken": token,
            },
            ...(cashDelta !== 0 ? { $inc: { cashAnchor: cashDelta } } : {}),
          },
        },
      });
    }
    await funds.bulkWrite(writes, { ordered: false });
    // Each write carries a token unique to this attempt, so a fund holding it
    // took this write and not another writer's.
    const after = await funds
      .find(
        { _id: { $in: attempted.map((a) => a.fund._id) } },
        { projection: { "nationalIndex.markToken": 1 } }
      )
      .toArray();
    const landedTokens = new Set(after.map((f) => f.nationalIndex?.markToken));
    const retry: NationalIndexMark[] = [];
    for (const a of attempted) {
      if (!landedTokens.has(a.token)) {
        retry.push(a.mark);
        continue;
      }
      marked++;
      if (a.cashDelta === 0) continue;
      transactions.push({
        _id: new ObjectId(),
        fundId: a.fund._id,
        kind: "national_index_mark",
        turn,
        navAnchor: a.mark.nav,
        amountAnchor: a.cashDelta,
        note: `Marked to the ${a.mark.displayName} output index`,
        createdAt: now,
      });
      // Attributed like an admin fund mint: the counterparty is the background
      // economy, whose own money is not modelled (see the funded-market trade).
      legs.push({
        type: "admin_transfer",
        turn,
        createdAt: now,
        subjectType: "corporation",
        subjectId: a.fund._id,
        subjectName: a.fund.name,
        amount: a.cashDelta,
        anchorAmount: a.cashDelta,
        currencyCode: a.fund.anchorCurrencyCode,
        counterpartyType: "system",
        counterpartyName: `${a.mark.displayName} economy`,
        meta: {
          kind: "national_index_mark",
          ...(a.cashDelta > 0 ? { mint: true } : { burn: true }),
          fundSlug: a.fund.slug,
          countryId: a.mark.countryId,
        },
      });
    }
    pending = retry;
    await markAttempt(attempt + 1);
  };
  await markAttempt(0);
  if (transactions.length > 0) {
    await db.collection<IndexFundTransaction>("indexFundTransactions").insertMany(transactions);
  }
  if (legs.length > 0) await emitTxBulk(db, legs, await loadTxThresholds(db));
  return { created: missing.length, marked };
}
