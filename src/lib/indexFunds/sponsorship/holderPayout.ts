/**
 * Pay one fund holder cash, whatever kind of holder they are.
 *
 * Mirrors the currency handling in `dividendPassThrough`: a character's wallet
 * is NATIVE, so the ₳ amount is multiplied by the fund's FX rate before it
 * lands, while an NPP's investment cash is already ₳ and takes the anchor
 * amount unconverted. Getting this backwards is precisely the A0 defect that
 * mispriced every non-USD fund, so the two paths are kept explicitly apart.
 *
 * `fund_reserve` positions are skipped: the reserve is the fund's own units,
 * and paying it would be the fund paying itself.
 */

import {
  anchorToCorpLiquidCapital,
  loadFxRatesRecord,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import type { Corporation } from "@/lib/db/types";
import { ObjectId, type Db, type Document } from "mongodb";
import type { IndexFund, IndexFundPosition, IndexFundTransaction } from "@/lib/db/types/indexFund";
import { buildPersonalBalanceInc, loadCharacterFxRate } from "@/lib/currency/characterFunds";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { loadFundPayoutFxRate } from "@/lib/indexFunds/dividendPassThrough";

const FUND_TX = "indexFundTransactions";

/** One holder's wind-up payout, before it is settled with the rest of the book. */
export interface FundHolderCashPayout {
  position: IndexFundPosition;
  payoutAnchor: number;
}

export interface FundHolderCashBatchResult {
  /** Positions whose credit landed. */
  paid: IndexFundPosition[];
  /** Positions whose holder document no longer exists, so the credit never landed. */
  unpaid: IndexFundPosition[];
  distributedAnchor: number;
}

/** Collections a fund holder's balance can live in. */
type HolderCollection = "characters" | "imperialCharacters" | "npps" | "pensionSchemes";

type HolderCreditTarget = {
  collection: HolderCollection;
  id: ObjectId;
  /** Balance path and amount credited, in the collection's own currency. */
  inc: Record<string, number>;
};

type HolderCreditGroup = {
  position: IndexFundPosition;
  payoutAnchor: number;
  target: HolderCreditTarget;
};

/**
 * The holder document one position credits, or null for a kind this function
 * does not pay (`fund_reserve` is the fund's own units; an unidentifiable
 * holder cannot be paid at all).
 */
function creditTargetOf(
  position: IndexFundPosition,
  payoutAnchor: number,
  fundFxRate: number,
  fundCurrency: IndexFund["anchorCurrencyCode"],
  forexEnabled: boolean
): HolderCreditTarget | null {
  if (position.holderKind === "character" && position.characterId)
    return {
      collection: "characters",
      id: position.characterId,
      inc: buildPersonalBalanceInc(payoutAnchor * fundFxRate, fundCurrency, forexEnabled),
    };
  if (position.holderKind === "imperial_character" && position.imperialCharacterId)
    return {
      collection: "imperialCharacters",
      id: position.imperialCharacterId,
      inc: buildPersonalBalanceInc(payoutAnchor * fundFxRate, fundCurrency, forexEnabled),
    };
  if (position.holderKind === "npp" && position.nppId)
    // NPP investment cash is denominated in ₳ already - no rate.
    return {
      collection: "npps",
      id: position.nppId,
      inc: { nppInvestmentCashAnchor: payoutAnchor },
    };
  if (position.holderKind === "pension_scheme" && position.pensionSchemeId)
    return {
      collection: "pensionSchemes",
      id: position.pensionSchemeId,
      inc: { assetsAnchor: payoutAnchor },
    };
  return null;
}

/**
 * Credit one holder collection in a single bulk write. A holder that vanished
 * mid-pass is left unpaid, exactly as the per-holder path reported it: one read
 * names them, and the caller decides whether that blocks the wind-up.
 */
async function creditHolderBook(
  db: Db,
  collection: HolderCollection,
  group: HolderCreditGroup[],
  now: Date
): Promise<{
  paid: { position: IndexFundPosition; payoutAnchor: number }[];
  unpaid: IndexFundPosition[];
}> {
  const credited = await db.collection(collection).bulkWrite(
    group.map(({ target }) => ({
      updateOne: {
        filter: { _id: target.id },
        update: { $inc: target.inc, $set: { updatedAt: now } },
      },
    })),
    { ordered: true }
  );
  if (credited.matchedCount === group.length)
    return {
      paid: group.map(({ position, payoutAnchor }) => ({ position, payoutAnchor })),
      unpaid: [],
    };
  const live = new Set(
    (
      await db
        .collection<Document>(collection)
        .find({ _id: { $in: group.map(({ target }) => target.id) } }, { projection: { _id: 1 } })
        .toArray()
    ).map((row) => String(row._id))
  );
  const paid: { position: IndexFundPosition; payoutAnchor: number }[] = [];
  const unpaid: IndexFundPosition[] = [];
  for (const { position, payoutAnchor, target } of group) {
    if (live.has(String(target.id))) paid.push({ position, payoutAnchor });
    else unpaid.push(position);
  }
  return { paid, unpaid };
}

/**
 * Pay a whole book of wind-up holders: one read for the fund's rate, one bulk
 * write per holder collection and one receipt write, whatever the book size.
 * Paying each holder on its own reloaded the fund's exchange rate and issued a
 * separate credit and receipt per position, which is what made a wind-up of a
 * few hundred holders the most expensive substep of the sponsorship pass.
 */
export async function payFundHoldersCash(
  db: Db,
  fund: IndexFund,
  payouts: FundHolderCashPayout[],
  currentTurn: number,
  now: Date
): Promise<FundHolderCashBatchResult> {
  const pay = payouts.filter(
    (payout) =>
      payout.payoutAnchor > 0 &&
      payout.position.holderKind !== "fund_reserve" &&
      payout.position.holderKind !== "corporation"
  );
  if (!pay.length) return { paid: [], unpaid: [], distributedAnchor: 0 };

  const forexEnabled = await isForexEnabled();
  let fundFxRate = await loadFundPayoutFxRate(db, fund.anchorCurrencyCode, forexEnabled);
  if (forexEnabled && fund.seedAccounting === "paid_units") {
    const quote = await loadCharacterFxRate(db, fund.anchorCurrencyCode);
    if (!quote.ok || !Number.isFinite(quote.rate) || quote.rate <= 0)
      throw new Error("Fund payout exchange rate unavailable");
    fundFxRate = quote.rate;
  }

  const byCollection = new Map<HolderCollection, HolderCreditGroup[]>();
  const unpaid: IndexFundPosition[] = [];
  for (const { position, payoutAnchor } of pay) {
    const target = creditTargetOf(
      position,
      payoutAnchor,
      fundFxRate,
      fund.anchorCurrencyCode,
      forexEnabled
    );
    if (!target) {
      unpaid.push(position);
      continue;
    }
    const group = byCollection.get(target.collection) ?? [];
    group.push({ position, payoutAnchor, target });
    byCollection.set(target.collection, group);
  }

  const paid: { position: IndexFundPosition; payoutAnchor: number }[] = [];
  for (const [collection, group] of byCollection) {
    const settled = await creditHolderBook(db, collection, group, now);
    paid.push(...settled.paid);
    unpaid.push(...settled.unpaid);
  }

  if (paid.length) {
    await db
      .collection<IndexFundTransaction>(FUND_TX)
      .insertMany(
        paid.map(({ position, payoutAnchor }) =>
          holderReceiptDoc(fund, position, payoutAnchor, currentTurn, now)
        )
      );
  }

  return {
    paid: paid.map(({ position }) => position),
    unpaid,
    distributedAnchor: paid.reduce((sum, { payoutAnchor }) => sum + payoutAnchor, 0),
  };
}

export async function payFundHolderCash(
  db: Db,
  fund: IndexFund,
  position: IndexFundPosition,
  payoutAnchor: number,
  currentTurn: number,
  now: Date
): Promise<boolean> {
  if (position.holderKind === "fund_reserve") return false;
  if (payoutAnchor <= 0) return false;

  if (position.holderKind === "corporation" && position.corporationId) {
    const corp = await db
      .collection<Corporation>("corporations")
      .findOne(
        { _id: position.corporationId },
        { projection: { liquidCurrencyCode: 1, countryId: 1 } }
      );
    if (!corp) return false;
    const currency = resolveCorpLiquidCurrencyCode(corp);
    const forexEnabled = await isForexEnabled();
    const rates = forexEnabled ? await loadFxRatesRecord(db) : {};
    const rate = forexEnabled && currency ? rates[currency] : 1;
    if (!rate || rate <= 0) throw new Error("Corporate payout exchange rate unavailable");
    const credited = await db.collection("corporations").updateOne(
      { _id: corp._id },
      {
        $inc: { liquidCapital: anchorToCorpLiquidCapital(payoutAnchor, corp, rate) },
        $set: { updatedAt: now },
      }
    );
    if (!credited.matchedCount) return false;
    await insertHolderReceipt(db, fund, position, payoutAnchor, currentTurn, now);
    return true;
  }

  const { paid } = await payFundHoldersCash(
    db,
    fund,
    [{ position, payoutAnchor }],
    currentTurn,
    now
  );
  return paid.length === 1;
}

/** The distribution receipt one paid holder leaves behind. */
function holderReceiptDoc(
  fund: IndexFund,
  position: IndexFundPosition,
  payoutAnchor: number,
  currentTurn: number,
  now: Date
): IndexFundTransaction {
  return {
    _id: new ObjectId(),
    fundId: fund._id,
    kind: "wind_up_distribution",
    turn: currentTurn,
    holderKind: position.holderKind,
    ...(position.corporationId ? { corporationId: position.corporationId } : {}),
    ...(position.characterId ? { characterId: position.characterId } : {}),
    ...(position.imperialCharacterId ? { imperialCharacterId: position.imperialCharacterId } : {}),
    ...(position.nppId ? { nppId: position.nppId } : {}),
    ...(position.pensionSchemeId ? { pensionSchemeId: position.pensionSchemeId } : {}),
    units: position.units,
    amountAnchor: payoutAnchor,
    note: `Wind-up distribution from ${fund.name}`,
    createdAt: now,
  } as IndexFundTransaction;
}

async function insertHolderReceipt(
  db: Db,
  fund: IndexFund,
  position: IndexFundPosition,
  payoutAnchor: number,
  currentTurn: number,
  now: Date
): Promise<void> {
  await db
    .collection<IndexFundTransaction>(FUND_TX)
    .insertOne(holderReceiptDoc(fund, position, payoutAnchor, currentTurn, now));
}
