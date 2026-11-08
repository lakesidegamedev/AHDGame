import { ObjectId, type Db } from "mongodb";
import type { Bond, IndexFund } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";
import { payNppBondReturns, type NppBondReturns } from "@/lib/turn/nppBondCash";

/** ₳ owed to the non-personal holders of a bond position, keyed by holder id. */
export interface InstitutionalBondPayouts {
  fundAnchor: Map<string, number>;
  nppAnchor: Map<string, number>;
}

export function emptyInstitutionalBondPayouts(): InstitutionalBondPayouts {
  return { fundAnchor: new Map(), nppAnchor: new Map() };
}

/** Units a bond's issuer holds of its own debt; the claim cancels, nobody is paid. */
export function selfHeldBondUnits(bond: Pick<Bond, "corporationId" | "holders">): number {
  const issuer = bond.corporationId.toString();
  let units = 0;
  for (const h of bond.holders ?? []) {
    if (h.corporationId && h.corporationId.toString() === issuer) units += h.units;
  }
  return units;
}

/**
 * Bank treasuries buy only sovereign bonds, so a bank holder on a corporate bond
 * means a new purchase path appeared. Default, restructure and refinance would
 * pay it nothing, so they refuse rather than drop the claim.
 */
export function assertNoBankTreasuryHolders(
  bonds: ReadonlyArray<Pick<Bond, "_id" | "holders">>
): void {
  for (const bond of bonds) {
    if ((bond.holders ?? []).some((h) => h.bankId))
      throw new Error(
        `Corporate bond ${String(bond._id)} has a bank treasury holder; the default paths do not pay banks`
      );
  }
}

/** Add a fund or NPP holder's ₳ amount; returns false for every other holder kind. */
export function addInstitutionalBondPayout(
  payouts: InstitutionalBondPayouts,
  holder: Pick<Bond["holders"][number], "fundId" | "nppId">,
  amountAnchor: number
): boolean {
  if (holder.fundId) {
    const k = holder.fundId.toString();
    payouts.fundAnchor.set(k, (payouts.fundAnchor.get(k) ?? 0) + amountAnchor);
    return true;
  }
  if (holder.nppId) {
    const k = holder.nppId.toString();
    payouts.nppAnchor.set(k, (payouts.nppAnchor.get(k) ?? 0) + amountAnchor);
    return true;
  }
  return false;
}

/**
 * Credit fund cash and NPP investment cash (both held in ₳) and return the
 * fund-subject ledger rows. NPP credits book their own witnesses.
 */
export async function payInstitutionalBondHolders(
  db: Db,
  payouts: InstitutionalBondPayouts,
  context: {
    turn: number;
    now: Date;
    source: string;
    issuerId: ObjectId;
    issuerName: string;
    txType: "bond_maturity" | "bond_dissolution_payout";
  }
): Promise<Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[]> {
  const txEntries: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[] = [];
  const fundRows = [...payouts.fundAnchor]
    .map(([id, amount]) => [id, Math.round(amount * 100) / 100] as const)
    .filter(([, amount]) => amount > 0);
  if (fundRows.length > 0) {
    const funds = await db
      .collection<IndexFund>("indexFunds")
      .find(
        { _id: { $in: fundRows.map(([id]) => new ObjectId(id)) } },
        { projection: { anchorCurrencyCode: 1, name: 1 } }
      )
      .toArray();
    const fundById = new Map(funds.map((f) => [f._id.toString(), f]));
    await db.collection<IndexFund>("indexFunds").bulkWrite(
      fundRows.map(([id, amount]) => ({
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $inc: { cashAnchor: amount }, $set: { updatedAt: context.now } },
        },
      }))
    );
    for (const [id, amount] of fundRows) {
      const fund = fundById.get(id);
      if (!fund) continue;
      const currency = fund.anchorCurrencyCode as CurrencyCode;
      txEntries.push({
        type: context.txType,
        turn: context.turn,
        createdAt: context.now,
        subjectType: "fund",
        subjectId: new ObjectId(id),
        subjectName: fund.name,
        amount,
        anchorAmount: amount,
        currencyCode: currency,
        counterpartyType: "corporation",
        counterpartyId: context.issuerId,
        counterpartyName: context.issuerName,
        meta: { source: context.source, side: "bondholder", fundId: id, fundCurrency: currency },
      });
    }
  }
  if (payouts.nppAnchor.size > 0) {
    const nppReturns = new Map<string, NppBondReturns>();
    for (const [id, amount] of payouts.nppAnchor) {
      if (amount > 0) nppReturns.set(id, { total: amount, coupon: 0, maturity: amount });
    }
    await payNppBondReturns(db, nppReturns, context.turn, context.now);
  }
  return txEntries;
}
