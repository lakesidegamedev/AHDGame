/**
 * National index funds for background countries (#5702).
 *
 * Each background country gets one ordinary index fund, created the first
 * time its kernel ticks, so players buy and sell it through the existing fund
 * subscribe and redeem routes and hold it as an ordinary fund position. Its
 * only asset is cash kept equal to NAV times units; each kernel tick marks it
 * to the country's index level, creating or withdrawing the difference
 * against the background economy with a ledger leg. The fund cron leaves the
 * fund's assets alone (see `isNationalIndexFund`) and only serves its
 * redemption queue and snapshots.
 *
 * Batched: one fund read, at most one insert, one queued-unit read, one bulk
 * fund write, one transaction insert and one ledger emission per tick.
 */
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { IndexFund, IndexFundTransaction } from "@/lib/db/types/indexFund";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { loadQueuedRedemptionUnitsByFundId } from "@/lib/indexFunds/fundValuation";
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";
import { markNationalIndexFund, nationalIndexFundIdentity } from "./rules/nationalIndex";

/** True for a background country's national index fund. */
export function isNationalIndexFund(fund: Pick<IndexFund, "nationalIndex">): boolean {
  return typeof fund.nationalIndex?.entityId === "string";
}

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
      {
        projection: {
          slug: 1,
          name: 1,
          anchorCurrencyCode: 1,
          quotedNav: 1,
          unitSupply: 1,
          cashAnchor: 1,
          nationalIndex: 1,
        },
      }
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

  const present = marks.filter((m) => byCountry.has(m.countryId));
  if (present.length === 0) return { created: missing.length, marked: 0 };
  const queued = await loadQueuedRedemptionUnitsByFundId(
    db,
    present.map((m) => byCountry.get(m.countryId)!._id)
  );
  const writes: AnyBulkWriteOperation<IndexFund>[] = [];
  const transactions: IndexFundTransaction[] = [];
  const legs: TxInput[] = [];
  for (const mark of present) {
    const fund = byCountry.get(mark.countryId)!;
    const { cashDelta } = markNationalIndexFund({
      quotedNav: fund.quotedNav,
      newNav: mark.nav,
      unitSupply: fund.unitSupply,
      queuedUnits: queued.get(String(fund._id)) ?? 0,
      cashAnchor: fund.cashAnchor,
    });
    writes.push({
      updateOne: {
        filter: { _id: fund._id },
        update: {
          $set: { quotedNav: mark.nav, backingRatio: 1, updatedAt: now },
          ...(cashDelta !== 0 ? { $inc: { cashAnchor: cashDelta } } : {}),
        },
      },
    });
    if (cashDelta === 0) continue;
    transactions.push({
      _id: new ObjectId(),
      fundId: fund._id,
      kind: "national_index_mark",
      turn,
      navAnchor: mark.nav,
      amountAnchor: cashDelta,
      note: `Marked to the ${mark.displayName} output index`,
      createdAt: now,
    });
    // Attributed like an admin fund mint: the counterparty is the background
    // economy, whose own money is not modelled (see the funded-market trade).
    legs.push({
      type: "admin_transfer",
      turn,
      createdAt: now,
      subjectType: "corporation",
      subjectId: fund._id,
      subjectName: fund.name,
      amount: cashDelta,
      anchorAmount: cashDelta,
      currencyCode: fund.anchorCurrencyCode,
      counterpartyType: "system",
      counterpartyName: `${mark.displayName} economy`,
      meta: {
        kind: "national_index_mark",
        ...(cashDelta > 0 ? { mint: true } : { burn: true }),
        fundSlug: fund.slug,
        countryId: mark.countryId,
      },
    });
  }
  if (writes.length > 0) await funds.bulkWrite(writes, { ordered: false });
  if (transactions.length > 0) {
    await db.collection<IndexFundTransaction>("indexFundTransactions").insertMany(transactions);
  }
  if (legs.length > 0) await emitTxBulk(db, legs, await loadTxThresholds(db));
  return { created: missing.length, marked: present.length };
}
