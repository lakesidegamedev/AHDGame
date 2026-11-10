/** Funding a newly issued sovereign series and handling a placement shortfall. */
import { type Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { CentralBank, FederalBudget, Bond } from "@/lib/db/types";
import { createNotifications } from "@/lib/notifications";
import {
  type PrimaryAccountingContext,
  primarySettlementExists,
  primaryDocumentId,
  poolCashPerFace,
  commitSovereignPrimary,
} from "./sovereignPrimarySettlement";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import {
  readPoolForPrimary,
  planSovereignMonetization,
  planSovereignUnderwriting,
} from "@/lib/bonds/primaryMarket";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import type { TransitionProjection } from "@/lib/banking/rules/boundary";
import { treasuryAdvanceMoneyDelta } from "@/lib/moneySupply/rules/assemble";
import { getSovereignIssuerName, applySovereignDebtAdjustment } from "./sovereign";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bondsCollection } from "@/lib/db/repositories/bonds";

/**
 * What happens to the part of a quarterly auction the pool would not take.
 * An autonomous chair (`chairMode: "npp"`) monetizes up to a share of GDP at
 * par: the bank books the units, deposits are created as under QE, and the
 * paper becomes real debt. A player-run bank is told and left to decide; the
 * units keep placing turn by turn as the pool's cash allows either way.
 * Returns the face and annual coupon the monetization added to the debt.
 */
export async function handleSovereignShortfall(
  db: Db,
  args: {
    countryId: CountryId;
    centralBank: CentralBank | null;
    budget: FederalBudget;
    bondDocs: Omit<Bond, "_id">[];
    insertedIds: ObjectId[];
    unsoldTotal: number;
    requestedTotal: number;
    turn: number;
    now: Date;
  }
): Promise<{ face: number; annualCoupon: number }> {
  const bank = args.centralBank;
  const face = 0;
  const annualCoupon = 0;

  if (bank?.chairCharacterId) {
    const chair = await db
      .collection<{ _id: ObjectId; userId?: ObjectId }>("characters")
      .findOne({ _id: bank.chairCharacterId }, { projection: { userId: 1 } });
    if (chair?.userId) {
      const pct = Math.round((1 - args.unsoldTotal / Math.max(1, args.requestedTotal)) * 100);
      await createNotifications([
        {
          userId: chair.userId,
          type: "cb_auction_shortfall",
          title: "Bond auction undersubscribed",
          message: `${getSovereignIssuerName(args.countryId)}: the market took ${pct}% of this quarter's issue. ${args.unsoldTotal.toLocaleString("en-US")} units are unplaced. They will place as the market finds cash; the bank can buy the float to support demand.`,
          metadata: {
            countryId: args.countryId,
            turn: args.turn,
            unsoldUnits: args.unsoldTotal,
            requestedUnits: args.requestedTotal,
          },
        },
      ]);
    }
  }
  return { face, annualCoupon };
}

/** One durable intent owns the complete ladder, including autonomous funding. */
export async function fundSovereignSeries(
  db: Db,
  args: {
    key: string;
    countryId: CountryId;
    turn: number;
    now: Date;
    budget: FederalBudget;
    centralBank: CentralBank | null;
    bondDocs: Omit<Bond, "_id">[];
    accounting: PrimaryAccountingContext;
  }
): Promise<Bond[]> {
  if (await primarySettlementExists(db, args.key)) {
    return bondsCollection(db)
      .find({ _id: { $in: args.bondDocs.map((_, i) => primaryDocumentId(`${args.key}:${i}`)) } })
      .toArray();
  }
  const currency =
    resolveCountryCurrencyCode(args.budget) ?? COUNTRY_CURRENCY_MAP[args.countryId] ?? "USD";
  const pool = await readPoolForPrimary(db, currency);
  let available = Math.max(0, pool?.cashLocal ?? 0);
  const requested = args.bondDocs.reduce(
    (sum, doc) => sum + Math.floor(doc.totalIssued / BOND_UNIT_FACE_VALUE),
    0
  );
  // Funded Treasury cash forbids minting: the gap stays unsold and
  // places later as pool cash allows, with no face, principal or coupon now.
  let monetaryCapacity =
    args.accounting.treasuryCashLedgerEnabled !== true &&
    args.centralBank?.chairMode === "npp" &&
    args.centralBank.chairControlsLocked !== true
      ? planSovereignMonetization({
          unsoldUnits: requested,
          gdpLocal: args.budget.gdpSmoothed || args.budget.gdp,
          pricePerUnitLocal: BOND_UNIT_FACE_VALUE,
        }).units
      : 0;
  let poolCash = 0,
    monetaryCash = 0,
    face = 0,
    annualCoupon = 0,
    placedByPool = 0;
  // Under the fiscal scale split the pool pays book face times the scale per
  // unit, the same rate it is repaid at maturity.
  const poolPricePerUnit = BOND_UNIT_FACE_VALUE * poolCashPerFace(args.accounting, args.countryId);
  const funded = args.bondDocs.map((doc, index): Bond => {
    const requestedUnits = Math.floor(doc.totalIssued / BOND_UNIT_FACE_VALUE);
    const placed = planSovereignUnderwriting({
      requestedUnits,
      poolCashLocal: available,
      appetite: pool?.appetiteByCountry?.[args.countryId],
      pricePerUnitLocal: poolPricePerUnit,
    }).placedUnits;
    const monetized = Math.min(requestedUnits - placed, monetaryCapacity);
    available -= placed * poolPricePerUnit;
    monetaryCapacity -= monetized;
    poolCash += placed * poolPricePerUnit;
    monetaryCash += monetized * BOND_UNIT_FACE_VALUE;
    placedByPool += placed;
    const issuedFace = (placed + monetized) * BOND_UNIT_FACE_VALUE;
    face += issuedFace;
    annualCoupon += (issuedFace * doc.couponRate) / 100;
    return {
      ...doc,
      _id: primaryDocumentId(`${args.key}:${index}`),
      totalIssued: issuedFace,
      publicFloat: placed,
      centralBankHoldings: monetized,
      requestedUnits,
      unsoldUnits: requestedUnits - placed - monetized,
      primaryFillRatio: requestedUnits ? placed / requestedUnits : 1,
      qeSupportRatio: placed + monetized > 0 ? monetized / (placed + monetized) : 0,
    };
  });
  const projections: TransitionProjection[] = funded.map((doc) => ({
    collection: "bonds",
    insert: doc as unknown as Record<string, unknown>,
    note: "Issued sovereign tranche",
  }));
  projections.push({
    collection: "federalBudget",
    filter: { _id: args.budget._id },
    update: {
      $set: {
        lastPrimaryFillRatio: requested
          ? Math.round((placedByPool / requested) * 10000) / 10000
          : 1,
        lastPrimaryAuctionTurn: args.turn,
        updatedAt: args.now,
      },
    },
    note: "Primary auction result",
  });
  if (monetaryCash > 0)
    projections.push({
      collection: "centralBanks",
      filter: { _id: args.centralBank!._id },
      update: {
        $push: {
          monetaryOperations: {
            $each: [
              {
                type: "qe",
                turn: args.turn,
                amount: monetaryCash,
                moneySupplyDelta: treasuryAdvanceMoneyDelta(
                  args.budget.treasuryBalance + poolCash,
                  monetaryCash
                ),
                reserveDelta: 0,
                actorName: "Autonomous chair",
                reason: "Primary auction funding credited to issuer treasury",
                createdAt: args.now,
              },
            ],
            $slice: -100,
          },
        },
      },
      note: "Monetary auction receipt",
    });
  await commitSovereignPrimary(
    db,
    {
      key: args.key,
      countryId: args.countryId,
      turn: args.turn,
      currency,
      budgetId: args.budget._id,
      poolCash,
      monetaryCash,
      centralBankId: args.centralBank?._id,
      face,
      annualCoupon,
      now: args.now,
    },
    projections,
    args.accounting
  );
  await refreshSovereignDebtTerms(db, args.budget._id);
  const unsold = funded.reduce((sum, doc) => sum + (doc.unsoldUnits ?? 0), 0);
  if (unsold > 0)
    await handleSovereignShortfall(db, {
      ...args,
      bondDocs: funded,
      insertedIds: funded.map((doc) => doc._id),
      unsoldTotal: unsold,
      requestedTotal: requested,
    });
  return funded;
}

/** Refresh derived debt terms after a funded principal/coupon projection. */
export async function refreshSovereignDebtTerms(
  db: Db,
  budgetId: FederalBudget["_id"]
): Promise<void> {
  // Only what applySovereignDebtAdjustment reads: the full budget carries an
  // ever-growing settledKeys list this refresh has no use for.
  const refreshed = await federalBudgetCollection(db).findOne(
    { _id: budgetId },
    {
      projection: {
        debt: 1,
        "spending.debtInterest": 1,
        "spending.total": 1,
        "revenue.total": 1,
        gdp: 1,
        gdpSmoothed: 1,
        sovereignRiskAnchor: 1,
        imfSovereignBailoutActive: 1,
        investorConfidence: 1,
      },
    }
  );
  if (refreshed) {
    const terms = applySovereignDebtAdjustment(refreshed, 0, 0);
    await federalBudgetCollection(db).updateOne(
      { _id: budgetId },
      {
        $set: {
          "debt.interestRate": terms.debt.interestRate,
          debtToGdpRatio: terms.debtToGdpRatio,
          creditRating: terms.creditRating,
        },
      }
    );
  }
}
