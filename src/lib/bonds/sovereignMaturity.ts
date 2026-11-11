/** Sovereign bond maturity settlement: payout legs, rollover pricing and principal resync. */
import { type Db, ObjectId } from "mongodb";
import type { Bond } from "@/lib/db/types";
import { type CurrencyCode, COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import {
  sovereignBondOutstanding,
  sumOutstandingSovereignPrincipal,
  sovereignDebtTerms,
} from "@/lib/bonds/sovereignPrincipal";
import { type CountryId, getCountryConfig } from "@/lib/constants/countries";
import { getBankId } from "@/lib/centralBank/helpers";
import {
  FORCED_ROLLOVER_MATURITY,
  rollOverUnfundedSovereignPoolFloat,
} from "./forcedSovereignRollover";
import { sovereignCredibilitySpread } from "@/lib/centralBank/marketEffects";
import { sovereignCreditSpreadPp } from "@/lib/bonds/rules/sovereignCreditSpread";
import {
  type SovereignMaturityCashLeg,
  type SovereignMaturityLiveTargets,
  frozenClaimPoolCashPerFace,
  resolveSovereignMaturityPayoutLegs,
} from "./sovereignMaturityPayoutTargets";
import {
  type SettlementResult,
  resumeSettlement,
  settleTransition,
} from "@/lib/banking/settlementJournal";
import { settleSovereignPublicFloatDisposition } from "./publicFloatSovereignNovation";
import { refundSovereignMaturityShortfall } from "./sovereignMaturityRefunding";
import {
  sovereignMaturityRetirementFigures,
  sovereignMaturityBudgetRetirementInc,
  sovereignMaturityBondRetireProjection,
} from "./sovereignMaturityRetirement";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import {
  getNationalBudgetId,
  applySovereignDebtAdjustment,
  loadDemocraticSovereignSpread,
  getSovereignCouponRate,
} from "./sovereign";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

export async function settleSovereignBondMaturity(
  db: Db,
  bond: Pick<
    Bond,
    "countryId" | "couponRate" | "totalIssued" | "restructureHaircutPercent" | "currencyCode"
  >,
  repaymentLocal = bond.totalIssued,
  bankRepaymentLocal = 0
): Promise<{ amountLocal: number; currencyCode: CurrencyCode } | null> {
  if (!bond.countryId) return null;
  const budgetId = getNationalBudgetId(bond.countryId);
  const budget = await federalBudgetCollection(db).findOne({ _id: budgetId });
  if (!budget) return null;
  const currencyCode = resolveCountryCurrencyCode(budget) ?? COUNTRY_CURRENCY_MAP[bond.countryId];
  if (bond.currencyCode && bond.currencyCode !== currencyCode) {
    throw new Error("Sovereign maturity currency differs from its treasury");
  }
  if (!Number.isFinite(repaymentLocal) || repaymentLocal < 0) {
    throw new Error("Sovereign maturity requires a finite nonnegative repayment");
  }
  if (
    !Number.isFinite(bankRepaymentLocal) ||
    bankRepaymentLocal < 0 ||
    bankRepaymentLocal > repaymentLocal
  ) {
    throw new Error("Bank sovereign maturity share must be within the total repayment");
  }

  // Net exactly this bond's outstanding contribution (face minus any restructure
  // haircut, see sovereignPrincipal.ts), not raw face: a haircut bond carries
  // only its written-down stock on the books, so redeeming full face would push
  // principal below the remaining outstanding sum.
  const maturedFace = sovereignBondOutstanding({
    issuerType: "sovereign",
    matured: false,
    defaulted: false,
    totalIssued: bond.totalIssued,
    restructureHaircutPercent: bond.restructureHaircutPercent ?? null,
  });
  const annualCouponCost = (bond.couponRate / 100) * bond.totalIssued;
  const budgetUpdate = applySovereignDebtAdjustment(budget, -maturedFace, -annualCouponCost);

  const landed = await federalBudgetCollection(db).updateOne(
    { _id: budgetId },
    {
      // Rollover issuance credits this same treasury. Redemption must pay its
      // holders from cash as well as retiring the bond-owned debt stock.
      // Bank holders receive their exact share through the guarded settlement
      // journal. This legacy debit remains responsible for every other holder.
      $inc: { treasuryBalance: -(repaymentLocal - bankRepaymentLocal) },
      $set: {
        debt: budgetUpdate.debt,
        spending: budgetUpdate.spending,
        surplus: budgetUpdate.surplus,
        debtToGdpRatio: budgetUpdate.debtToGdpRatio,
        creditRating: budgetUpdate.creditRating,
        updatedAt: new Date(),
      },
    }
  );
  return landed.matchedCount === 1 ? { amountLocal: repaymentLocal, currencyCode } : null;
}

/** Coupon a fresh sovereign bond would carry now: prime, term, rating, credibility, democracy. */
export async function marketSovereignRolloverCoupon(db: Db, countryId: CountryId): Promise<number> {
  const [budget, centralBank, democraticSpreadPp] = await Promise.all([
    federalBudgetCollection(db).findOne(
      { _id: getNationalBudgetId(countryId) },
      { projection: { creditRating: 1 } }
    ),
    centralBanksCollection(db).findOne(
      { _id: getBankId(countryId) },
      { projection: { primeRate: 1, chairInfamy: 1 } }
    ),
    loadDemocraticSovereignSpread(db, countryId),
  ]);
  const primeRate =
    centralBank?.primeRate ?? getCountryConfig(countryId).centralBank.defaultPrimeRate;
  return getSovereignCouponRate(
    primeRate,
    FORCED_ROLLOVER_MATURITY,
    (centralBank ? sovereignCredibilitySpread(centralBank.chairInfamy ?? 0) : 0) +
      democraticSpreadPp,
    sovereignCreditSpreadPp(budget?.creditRating)
  );
}

/**
 * The payout journal legs for one funded maturity: the escrow debit, then one
 * credit per nonzero holder leg in frozen order. Shared with the remediation
 * heal, so a repaired journal is compared against exactly what a replay would
 * prepare.
 */
export function buildSovereignMaturityPayoutLegs(input: {
  bondId: ObjectId;
  claimId: string;
  currencyCode: CurrencyCode;
  treasuryLocalPerAnchor: number;
  amountLocal: number;
  holderLegs: readonly SovereignMaturityCashLeg[];
}) {
  const valuation = {
    currencyCode: input.currencyCode,
    localPerAnchor: input.treasuryLocalPerAnchor,
  };
  return [
    ...(input.amountLocal > 0
      ? [
          {
            kind: "debit" as const,
            amount: input.amountLocal,
            valuation,
            collection: "bonds",
            filter: {
              _id: input.bondId,
              "sovereignMaturityClaim.id": input.claimId,
              "sovereignMaturityClaim.escrowLocal": { $gte: input.amountLocal },
            },
            path: "sovereignMaturityClaim.escrowLocal",
            note: "Pay non-bank sovereign maturity holders from funded claim escrow",
          },
        ]
      : []),
    ...input.holderLegs
      .filter((leg) => leg.amount > 0)
      .map((leg) => ({
        kind: "credit" as const,
        amount: leg.amount,
        valuation: { currencyCode: leg.currencyCode, localPerAnchor: leg.localPerAnchor },
        collection: leg.collection,
        filter: leg.filter,
        path: leg.path,
        note: leg.note,
      })),
  ];
}

/** Freeze the due-turn holder snapshot before any maturity claim can be paid. */
export async function freezeFundedSovereignBondMaturityQuote(
  db: Db,
  input: {
    bond: Bond;
    dueTurn: number;
    currencyCode: CurrencyCode;
    treasuryLocalPerAnchor: number;
    nonBankRepaymentLocal: number;
    holderLegs: readonly SovereignMaturityCashLeg[];
    now: Date;
  }
): Promise<NonNullable<Bond["sovereignMaturityClaim"]> | null> {
  const {
    bond,
    dueTurn,
    currencyCode,
    treasuryLocalPerAnchor,
    nonBankRepaymentLocal,
    holderLegs,
    now,
  } = input;
  if (!Number.isSafeInteger(dueTurn) || dueTurn !== bond.maturityTurn)
    throw new Error("Funded sovereign maturity requires its frozen due turn");
  if (
    !Number.isFinite(nonBankRepaymentLocal) ||
    nonBankRepaymentLocal < 0 ||
    !Number.isFinite(treasuryLocalPerAnchor) ||
    treasuryLocalPerAnchor <= 0
  )
    throw new Error("Funded sovereign maturity requires finite cash and valuation");
  if (holderLegs.some((leg) => !Number.isFinite(leg.amount) || leg.amount < 0))
    throw new Error("Funded sovereign maturity holder legs must be finite and nonnegative");

  const claimId = `sovereign-maturity:${bond._id.toHexString()}:${dueTurn}`;
  let quote = bond.sovereignMaturityClaim;
  if (!quote) {
    if (!bond.countryId) return null;
    if (bond.currencyCode && bond.currencyCode !== currencyCode)
      throw new Error("Sovereign maturity currency differs from its treasury");
    const candidate: NonNullable<Bond["sovereignMaturityClaim"]> = {
      id: claimId,
      dueTurn,
      currencyCode,
      treasuryLocalPerAnchor,
      amountLocal: nonBankRepaymentLocal,
      escrowLocal: 0,
      sourceHolders: bond.holders ?? [],
      sourcePublicFloat: bond.publicFloat,
      sourceCentralBankHoldings: bond.centralBankHoldings,
      holderLegs: holderLegs.map((leg) => ({ ...leg })),
    };
    await bondsCollection(db).updateOne(
      {
        _id: bond._id,
        issuerType: "sovereign",
        countryId: bond.countryId,
        maturityTurn: dueTurn,
        matured: false,
        defaulted: false,
        holders: bond.holders,
        publicFloat: bond.publicFloat,
        ...(bond.centralBankHoldings === undefined
          ? { centralBankHoldings: { $exists: false } }
          : { centralBankHoldings: bond.centralBankHoldings }),
        sovereignMaturityClaim: { $exists: false },
      },
      { $set: { sovereignMaturityClaim: candidate, updatedAt: now } }
    );
    const saved = await bondsCollection(db).findOne(
      { _id: bond._id },
      { projection: { sovereignMaturityClaim: 1 } }
    );
    quote = saved?.sovereignMaturityClaim;
  }
  if (!quote || quote.id !== claimId || quote.dueTurn !== dueTurn)
    throw new Error("Sovereign maturity quote changed after it was frozen");
  return quote;
}

/**
 * A funded settlement, plus the face a forced rollover moved to a replacement
 * bond instead of paying from Treasury cash. Callers subtract it from the cash
 * they book without re-reading the retired bond's claim.
 */
export type SovereignMaturitySettlement = SettlementResult & {
  forcedRolloverFaceLocal?: number;
};

/**
 * Settle the non-bank holders of one matured sovereign bond from actual
 * spendable Treasury cash. The due-turn key freezes the original holder and
 * FX snapshot across retries. The budget's signed fiscal position and debt
 * service are accounting projections; the cash debit is a distinct guarded
 * leg. Bond retirement is deliberately the last projection, so a failed cash
 * or holder leg leaves the bond active and the original receipt resumable.
 */
export async function settleFundedSovereignBondMaturity(
  db: Db,
  input: {
    bond: Bond;
    turn: number;
    dueTurn: number;
    currencyCode: CurrencyCode;
    treasuryLocalPerAnchor: number;
    nonBankRepaymentLocal: number;
    holderLegs: readonly SovereignMaturityCashLeg[];
    now: Date;
    /** Payee existence for the whole maturity wave, so this bond need not read it. */
    liveTargets?: SovereignMaturityLiveTargets;
    /** Test seam for the isolated native-Mongo settlement fixture. */
    transactionClient?: import("mongodb").MongoClient;
    /**
     * `sovereignRolloverConsolidationEnabled`: refinance into the issuer's
     * shared rollover bond for the turn instead of one new bond per claim.
     */
    consolidateRollover?: boolean;
  }
): Promise<SovereignMaturitySettlement | null> {
  const {
    bond,
    turn,
    dueTurn,
    treasuryLocalPerAnchor,
    nonBankRepaymentLocal,
    holderLegs,
    now,
    transactionClient,
  } = input;
  if (!Number.isSafeInteger(dueTurn) || dueTurn !== bond.maturityTurn)
    throw new Error("Funded sovereign maturity requires its frozen due turn");
  if (
    !Number.isFinite(nonBankRepaymentLocal) ||
    nonBankRepaymentLocal < 0 ||
    !Number.isFinite(treasuryLocalPerAnchor) ||
    treasuryLocalPerAnchor <= 0
  )
    throw new Error("Funded sovereign maturity requires finite cash and valuation");
  if (holderLegs.some((leg) => !Number.isFinite(leg.amount) || leg.amount < 0))
    throw new Error("Funded sovereign maturity holder legs must be finite and nonnegative");
  if (!bond.countryId && !bond.sovereignMaturityClaim) return null;

  const claimId = `sovereign-maturity:${bond._id.toHexString()}:${dueTurn}`;
  const frozenQuote = await freezeFundedSovereignBondMaturityQuote(db, input);
  if (!frozenQuote) return null;
  let quote = frozenQuote;

  // Finish a previous attempt before opening another generation. A rejected
  // insufficient-cash attempt has no applied legs and is terminal by design;
  // its stable claim quote allows a new turn-keyed attempt without changing
  // payees, amounts, or FX. An unfinished funding attempt and an unfinished
  // payout receipt are answered by one read, not one lookup each.
  const priorReceipts = await bankMoneyMovesCollection<{ _id: string; status?: string }>(db)
    .find(
      // Two plain branches, not `^id:(fund:|payout$)`: an alternation is not a
      // simple prefix, so the server would walk the whole `_id` index for it.
      {
        $or: [{ _id: { $regex: `^${claimId}:fund:` } }, { _id: `${claimId}:payout` }],
        status: "partial",
      },
      { projection: { _id: 1, status: 1 } }
    )
    .toArray();
  const currentBond = await bondsCollection(db).findOne(
    { _id: bond._id },
    { projection: { sovereignMaturityClaim: 1 } }
  );
  const currentQuote = currentBond?.sovereignMaturityClaim;
  if (!currentQuote || currentQuote.id !== claimId)
    throw new Error("Frozen sovereign maturity quote disappeared");
  quote = currentQuote;
  if (quote.paid) {
    const completedPayout = await bankMoneyMovesCollection<{ _id: string }>(db).findOne(
      { _id: `${claimId}:payout` },
      { projection: { _id: 1 } }
    );
    if (!completedPayout) return null;
    return {
      ...(await resumeSettlement(db, completedPayout._id)),
      forcedRolloverFaceLocal: quote.forcedRollover?.faceLocal ?? 0,
    };
  }
  const pendingFunding = priorReceipts.filter((row) => row._id !== `${claimId}:payout`);
  const previousPayoutReceipt = priorReceipts.find((row) => row._id === `${claimId}:payout`);

  const sourceCountryId =
    quote.publicFloatDisposition?.mode === "novation"
      ? quote.publicFloatDisposition.sourceCountryId
      : bond.countryId;
  if (!sourceCountryId) return null;
  if (
    quote.publicFloatDisposition?.mode !== "novation" &&
    bond.currencyCode &&
    bond.currencyCode !== quote.currencyCode
  )
    throw new Error("Sovereign maturity currency differs from its treasury");
  const budgetId =
    quote.publicFloatDisposition?.mode === "novation"
      ? quote.publicFloatDisposition.budgetId
      : getNationalBudgetId(sourceCountryId);
  const budget = await federalBudgetCollection(db).findOne({ _id: budgetId });
  if (!budget) return null;
  const budgetCurrency =
    resolveCountryCurrencyCode(budget) ?? COUNTRY_CURRENCY_MAP[sourceCountryId];
  if (budgetCurrency !== quote.currencyCode)
    throw new Error("Sovereign maturity currency differs from its treasury");
  if (
    quote.publicFloatDisposition?.mode === "novation" &&
    budget.countryId !== quote.publicFloatDisposition.budgetCountryId
  )
    throw new Error("Sovereign maturity treasury identity changed after novation");
  const frozenBudgetIdentity =
    quote.publicFloatDisposition?.mode === "novation"
      ? {
          countryId: quote.publicFloatDisposition.budgetCountryId,
          ...(quote.publicFloatDisposition.budgetCurrencyCode === null
            ? { currencyCode: { $exists: false } }
            : { currencyCode: quote.publicFloatDisposition.budgetCurrencyCode }),
        }
      : {};

  const allowNovation =
    quote.escrowLocal === 0 &&
    quote.fundingAttemptTurn === undefined &&
    pendingFunding.length === 0;
  quote = await settleSovereignPublicFloatDisposition(
    db,
    bond,
    quote,
    turn,
    now,
    allowNovation,
    transactionClient,
    input.consolidateRollover === true
  );
  if (
    quote.publicFloatDisposition?.mode === "novation" &&
    quote.publicFloatDisposition.status !== "applied"
  )
    return null;
  for (const receipt of pendingFunding) {
    const recovered = await resumeSettlement(db, receipt._id);
    if (recovered.status !== "applied" && !(recovered.status === "replayed" && !recovered.error))
      return recovered;
  }
  if (pendingFunding.length > 0) {
    const refreshed = await bondsCollection(db).findOne(
      { _id: bond._id },
      { projection: { sovereignMaturityClaim: 1 } }
    );
    const refreshedQuote = refreshed?.sovereignMaturityClaim;
    if (!refreshedQuote || refreshedQuote.id !== claimId)
      throw new Error("Frozen sovereign maturity quote disappeared during funding recovery");
    quote = refreshedQuote;
  }
  const novatedUnits =
    quote.publicFloatDisposition?.mode === "novation"
      ? quote.publicFloatDisposition.acceptedUnits
      : 0;
  const cashAmountLocal =
    quote.publicFloatDisposition?.mode === "novation"
      ? (quote.publicFloatDisposition.residualAmountLocal ?? 0)
      : quote.amountLocal;

  const previousPayout = previousPayoutReceipt;
  if (previousPayout) {
    const recovered = await resumeSettlement(db, previousPayout._id);
    if (recovered.status === "applied" || (recovered.status === "replayed" && !recovered.error))
      return recovered;
    return recovered;
  }

  if (quote.escrowLocal < cashAmountLocal) {
    const currentBudget = await federalBudgetCollection(db).findOne(
      { _id: budgetId, ...frozenBudgetIdentity },
      { projection: { treasuryCashLocal: 1 } }
    );
    const cashOnHand = currentBudget?.treasuryCashLocal ?? 0;
    if (cashOnHand < cashAmountLocal) {
      // An unfundable maturity first rolls its pool holding into a par
      // replacement bond: the pool takes new paper, not cash. Retry once on
      // the rebased claim.
      if (!quote.forcedRollover && bond.countryId) {
        const rolled = await rollOverUnfundedSovereignPoolFloat(db, {
          bond: (await bondsCollection(db).findOne({ _id: bond._id })) ?? bond,
          claim: quote,
          turn,
          now,
          couponRate: await marketSovereignRolloverCoupon(db, bond.countryId),
          budgetId,
          client: transactionClient,
          consolidateReplacement: input.consolidateRollover === true,
        });
        if (rolled) {
          const rebased = await bondsCollection(db).findOne({ _id: bond._id });
          if (!rebased?.sovereignMaturityClaim?.forcedRollover) return null;
          return settleFundedSovereignBondMaturity(db, { ...input, bond: rebased });
        }
      }
      // Every other holder is paid in cash. The Treasury refinances what it
      // lacks by selling a refunding issue to the market, never by defaulting.
      if (!budget.countryId || getNationalBudgetId(budget.countryId as CountryId) !== budgetId)
        return null;
      const refunded = await refundSovereignMaturityShortfall(db, {
        sourceBond: bond,
        claimId,
        // Bounded by the cash this claim owes its non-bank holders, so the
        // total ever raised for them cannot exceed what they are paid.
        scopeOwedLocal: cashAmountLocal,
        scopeRefundedLocal: quote.refundedHolderFaceLocal ?? 0,
        shortfallLocal: cashAmountLocal - cashOnHand,
        countryId: budget.countryId,
        budgetId,
        currencyCode: quote.currencyCode,
        couponRate: await marketSovereignRolloverCoupon(db, budget.countryId as CountryId),
        scope: "holders",
        turn,
        now,
        consolidateReplacement: input.consolidateRollover === true,
      });
      if (refunded.status === "refused") return null;
      const refinanced = await federalBudgetCollection(db).findOne(
        { _id: budgetId, ...frozenBudgetIdentity },
        { projection: { treasuryCashLocal: 1 } }
      );
      if ((refinanced?.treasuryCashLocal ?? 0) < cashAmountLocal) return null;
    }
    if (quote.fundingAttemptTurn !== turn) {
      const priorAttemptTurn = quote.fundingAttemptTurn;
      const reservation = await bondsCollection(db).updateOne(
        {
          _id: bond._id,
          "sovereignMaturityClaim.id": claimId,
          "sovereignMaturityClaim.escrowLocal": quote.escrowLocal,
          ...(priorAttemptTurn === undefined
            ? { "sovereignMaturityClaim.fundingAttemptTurn": { $exists: false } }
            : { "sovereignMaturityClaim.fundingAttemptTurn": priorAttemptTurn }),
        },
        { $set: { "sovereignMaturityClaim.fundingAttemptTurn": turn } }
      );
      if (reservation.matchedCount !== 1) {
        const reservedBond = await bondsCollection(db).findOne(
          { _id: bond._id },
          { projection: { sovereignMaturityClaim: 1 } }
        );
        const reservedQuote = reservedBond?.sovereignMaturityClaim;
        if (
          !reservedQuote ||
          reservedQuote.id !== claimId ||
          reservedQuote.fundingAttemptTurn !== turn
        )
          return null;
        quote = reservedQuote;
      } else {
        quote = { ...quote, fundingAttemptTurn: turn };
      }
    }
    const attemptKey = `${claimId}:fund:${turn}`;
    let attempt = await settleTransition(db, {
      key: attemptKey,
      kind: "sovereign_maturity_funding",
      turn,
      currency: quote.currencyCode,
      legs: [
        {
          kind: "debit",
          amount: cashAmountLocal,
          valuation: {
            currencyCode: quote.currencyCode,
            localPerAnchor: quote.treasuryLocalPerAnchor,
          },
          collection: "federalBudget",
          filter: {
            _id: budgetId,
            ...frozenBudgetIdentity,
            treasuryCashLocal: { $gte: cashAmountLocal },
          },
          path: "treasuryCashLocal",
          note: "Fund frozen sovereign maturity claim from Treasury cash",
        },
        {
          kind: "credit",
          amount: cashAmountLocal,
          valuation: {
            currencyCode: quote.currencyCode,
            localPerAnchor: quote.treasuryLocalPerAnchor,
          },
          collection: "bonds",
          filter: {
            _id: bond._id,
            "sovereignMaturityClaim.id": claimId,
            "sovereignMaturityClaim.escrowLocal": quote.escrowLocal,
          },
          path: "sovereignMaturityClaim.escrowLocal",
          note: "Hold funded sovereign maturity cash in its immutable bond claim",
        },
      ],
      projections: [
        {
          collection: "federalBudget",
          filter: { _id: budgetId, ...frozenBudgetIdentity },
          update: { $inc: { treasuryBalance: -cashAmountLocal } },
          note: "Record funded sovereign principal payment in signed fiscal position",
        },
      ],
      event: {
        kind: "monetary.executed",
        command: "turn.sovereign.maturity.fund",
        subjectType: "government",
        subjectId: sourceCountryId,
        amount: cashAmountLocal,
        meta: { bondId: bond._id.toHexString(), dueTurn },
      },
    });
    if (attempt.status === "partial" || (attempt.status === "replayed" && attempt.error))
      attempt = await resumeSettlement(db, attemptKey);
    if (attempt.status !== "applied" && !(attempt.status === "replayed" && !attempt.error))
      return attempt;
    const fundedBond = await bondsCollection(db).findOne(
      { _id: bond._id },
      { projection: { sovereignMaturityClaim: 1 } }
    );
    const fundedQuote = fundedBond?.sovereignMaturityClaim;
    if (!fundedQuote || fundedQuote.escrowLocal < cashAmountLocal) return attempt;
    quote = fundedQuote;
  }

  const retirement = sovereignMaturityRetirementFigures(bond, quote);
  const payoutQuote =
    novatedUnits > 0
      ? {
          ...quote,
          amountLocal: cashAmountLocal,
          holderLegs: quote.holderLegs.map((leg) =>
            leg.collection === "bondMarketPools" &&
            String(leg.filter._id) === (bond.currencyCode ?? quote.currencyCode)
              ? {
                  ...leg,
                  amount: Math.max(
                    0,
                    leg.amount -
                      novatedUnits * BOND_UNIT_FACE_VALUE * frozenClaimPoolCashPerFace(quote)
                  ),
                }
              : leg
          ),
        }
      : quote;
  const disposition = payoutQuote.publicFloatDisposition;
  const frozenSourceIdentity =
    disposition?.mode === "novation"
      ? {
          issuerName: disposition.sourceIssuerName,
          corporationId: disposition.sourceCorporationId,
          couponRate: disposition.sourceCouponRate,
          ...(disposition.sourceCurrencyCode === null
            ? { currencyCode: { $exists: false } }
            : { currencyCode: disposition.sourceCurrencyCode }),
          ...(disposition.sourceRestructureHaircutPercent === null
            ? { restructureHaircutPercent: null }
            : { restructureHaircutPercent: disposition.sourceRestructureHaircutPercent }),
        }
      : {};
  const payoutKey = `${claimId}:payout`;
  const payoutHolderLegs = await resolveSovereignMaturityPayoutLegs(
    db,
    payoutQuote.holderLegs,
    {
      currencyCode: payoutQuote.currencyCode,
      localPerAnchor: payoutQuote.treasuryLocalPerAnchor,
    },
    input.liveTargets
  );
  const settled = await settleTransition(db, {
    key: payoutKey,
    kind: "sovereign_maturity_payout",
    turn,
    currency: payoutQuote.currencyCode,
    legs: buildSovereignMaturityPayoutLegs({
      bondId: bond._id,
      claimId,
      currencyCode: payoutQuote.currencyCode,
      treasuryLocalPerAnchor: payoutQuote.treasuryLocalPerAnchor,
      amountLocal: payoutQuote.amountLocal,
      holderLegs: payoutHolderLegs,
    }),
    projections: [
      {
        collection: "federalBudget",
        filter: { _id: budgetId },
        update: {
          // Delta projection preserves concurrent issuance and maturity
          // changes on the same country's budget. A stale $set here could
          // overwrite a second bond's newly issued or retired principal.
          $inc: sovereignMaturityBudgetRetirementInc(retirement),
          $set: { updatedAt: now },
        },
        note: "Retire matured sovereign debt after funded payouts",
      },
      sovereignMaturityBondRetireProjection({
        bond,
        quote,
        claimId,
        dueTurn,
        sourceCountryId,
        figures: retirement,
        turn,
        now,
        frozenSourceIdentity,
      }),
    ],
    event: {
      kind: "monetary.executed",
      command: "turn.sovereign.maturity.payout",
      subjectType: "government",
      subjectId: sourceCountryId,
      amount: payoutQuote.amountLocal,
      meta: { bondId: bond._id.toHexString(), dueTurn },
    },
  });
  return { ...settled, forcedRolloverFaceLocal: quote.forcedRollover?.faceLocal ?? 0 };
}

export interface SovereignPrincipalResync {
  countryId: CountryId;
  stored: number;
  outstanding: number;
  corrected: boolean;
}

/**
 * Re-point a country's stored `debt.principal` at its authoritative outstanding
 * bond stock (see sovereignPrincipal.ts) and refresh the debt-service terms off
 * that stock. Treasury cash is deliberately untouched: a haircut, repudiation,
 * or merge writes down obligations, never cash.
 *
 * Idempotent: a pure function of the bonds read, so crash/retry replay and the
 * end-of-turn hygiene pass converge to the same value.
 */
export async function resyncSovereignPrincipalFromBonds(
  db: Db,
  countryId: CountryId
): Promise<SovereignPrincipalResync | null> {
  const budgetId = getNationalBudgetId(countryId);
  const [budget, bonds] = await Promise.all([
    federalBudgetCollection(db).findOne({ _id: budgetId }),
    bondsCollection(db)
      .find(
        { issuerType: "sovereign", countryId, matured: false, defaulted: false },
        // The outstanding sum re-checks the query-filtered fields, so they
        // must be projected: a doc arriving without `issuerType` reads as
        // non-sovereign and contributes 0, which would re-point the stored
        // principal at zero.
        {
          projection: {
            issuerType: 1,
            matured: 1,
            defaulted: 1,
            totalIssued: 1,
            restructureHaircutPercent: 1,
          },
        }
      )
      .toArray(),
  ]);
  if (!budget || !budget.debt) return null;
  const outstanding = Math.round(sumOutstandingSovereignPrincipal(bonds));
  const stored = budget.debt.principal ?? 0;
  const terms = sovereignDebtTerms(outstanding, {
    gdp: budget.gdp ?? 0,
    gdpSmoothed: budget.gdpSmoothed,
    investorConfidence: budget.investorConfidence,
    imfBailoutActive: budget.imfSovereignBailoutActive,
    sovereignRiskAnchor: budget.sovereignRiskAnchor,
  });
  await federalBudgetCollection(db).updateOne(
    { _id: budgetId },
    {
      $set: {
        "debt.principal": outstanding,
        "debt.interestRate": terms.interestRate,
        debtToGdpRatio: terms.debtToGdpRatio,
        creditRating: terms.creditRating,
        updatedAt: new Date(),
      },
    }
  );
  return { countryId, stored, outstanding, corrected: stored !== outstanding };
}
