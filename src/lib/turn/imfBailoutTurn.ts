import { isForexEnabled } from "@/lib/currency/featureFlag";
/** IMF obligations and receipts use anchor principal and frozen native cash legs. */
import { type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import {
  resolveCorpLiquidCurrencyCode,
  loadFxRatesByCurrency,
} from "@/lib/currency/corporationCapital";
import {
  IMF_BAILOUT_DEFAULT_INCOME_CAPTURE_FRACTION,
  IMF_BAILOUT_INCOME_FRACTION_CAP,
} from "@/lib/imf/constants";
import { computeImfFacilityPaymentTurn } from "@/lib/imf/imfFacilityMath";
import { getImfCorporation } from "@/lib/imf/resolveImfCorporation";
import type { CorpSnapshot } from "@/lib/turn/corporation/types";
import type { BankingTransition } from "@/lib/banking/rules/boundary";
import { oid } from "@/lib/banking/rules/boundary";
import { settleTransition, resumeSettlement } from "@/lib/banking/settlementJournal";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { buildTxDocs, loadTxThresholds } from "@/lib/financialTxLog/emit";
import { loadTurnLengthMinutes } from "@/lib/financialTxLog/expiresAt";

export async function processImfBailoutPayments(
  db: Db,
  turn: number,
  corpSnapshots: CorpSnapshot[],
  corporations: Corporation[]
): Promise<{ paymentsApplied: number }> {
  for (const snapshot of corpSnapshots) {
    snapshot.settledImfInterestPaid = 0;
    snapshot.settledImfInterestReceived = 0;
    snapshot.settledImfPrincipalPaid = 0;
    snapshot.settledImfPrincipalReceived = 0;
    snapshot.imfSettlementUnavailable = false;
  }
  const existing = new Set(
    (
      await bankMoneyMovesCollection<{ _id: string }>(db)
        .find({ kind: "imf_facility_payment", turn }, { projection: { _id: 1 } })
        .toArray()
    ).map((row) => row._id)
  );
  const borrowers = corporations.filter(
    (corp) =>
      (corp.imfBailoutActive && (corp.imfFacilityPrincipalOutstanding ?? 0) > 1e-6) ||
      existing.has(`imf-service:${corp._id}:${turn}`)
  );
  if (!borrowers.length) return { paymentsApplied: 0 };
  const imf = await getImfCorporation(db);
  if (!imf) {
    for (const snapshot of corpSnapshots) {
      if (borrowers.some((corp) => corp._id.equals(snapshot.corpId)))
        snapshot.imfSettlementUnavailable = true;
    }
    return { paymentsApplied: 0 };
  }
  const forexEnabled = await isForexEnabled();
  const fx = forexEnabled ? await loadFxRatesByCurrency(db) : new Map();
  const codeOf = (corp: Corporation) => resolveCorpLiquidCurrencyCode(corp) ?? "USD";
  const rateOf = (corp: Corporation) => {
    const code = resolveCorpLiquidCurrencyCode(corp);
    return forexEnabled && code ? fx.get(code) : 1;
  };
  const imfRate = rateOf(imf);

  const snapshots = new Map(corpSnapshots.map((snapshot) => [String(snapshot.corpId), snapshot]));
  const keyOf = (corp: Corporation) => `imf-service:${corp._id}:${turn}`;
  const [thresholds, turnLengthMinutes] = await Promise.all([
    loadTxThresholds(db),
    loadTurnLengthMinutes(db),
  ]);
  let paymentsApplied = 0;
  for (const corp of borrowers) {
    if (corp._id.equals(imf._id)) continue;
    const key = keyOf(corp);
    if (existing.has(key)) {
      const resumed = await resumeSettlement(db, key);
      if (resumed.error) throw new Error(`IMF settlement remains pending: ${resumed.error}`);
      paymentsApplied++;
      continue;
    }
    const rate = rateOf(corp);
    // An unavailable quote defers this facility, never invents a rate or aborts other companies.
    if (
      !rate ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      !imfRate ||
      !Number.isFinite(imfRate) ||
      imfRate <= 0
    )
      continue;
    const snapshot = snapshots.get(String(corp._id));
    const cap = Math.min(
      IMF_BAILOUT_INCOME_FRACTION_CAP,
      corp.imfFacilityIncomeCaptureFraction ?? IMF_BAILOUT_DEFAULT_INCOME_CAPTURE_FRACTION
    );
    const cashAnchor = Math.max(0, snapshot?.liquidCapital ?? corp.liquidCapital ?? 0) / rate;
    const split = computeImfFacilityPaymentTurn({
      principalOutstanding: corp.imfFacilityPrincipalOutstanding ?? 0,
      annualRatePercent: corp.imfFacilityAnnualRate ?? 0,
      remainingTurns: corp.imfFacilityAmortizationTurnsRemaining ?? 48,
      turnIncome: Math.min(snapshot?.income ?? 0, cap > 0 ? cashAnchor / cap : 0),
      incomeCapFraction: cap,
    });
    const now = new Date();
    const cleared = split.newPrincipal <= 1e-6;
    const debit = split.actualPayment * rate;
    const credit = split.actualPayment * imfRate;
    const update = {
      $set: {
        imfFacilityPrincipalOutstanding: cleared ? 0 : split.newPrincipal,
        imfFacilityAmortizationTurnsRemaining: cleared ? 0 : split.newRemainingTurns,
        ...(cleared ? { imfBailoutActive: false, imfFacilityAnnualRate: 0 } : {}),
        updatedAt: now,
      },
    };
    const rows =
      split.actualPayment > 0
        ? buildTxDocs(
            [
              {
                type: "bank_loan_repayment",
                turn,
                createdAt: now,
                subjectType: "corporation",
                subjectId: corp._id,
                subjectName: corp.name,
                amount: -debit,
                anchorAmount: -split.actualPayment,
                currencyCode: codeOf(corp),
                counterpartyType: "corporation",
                counterpartyId: imf._id,
                counterpartyName: imf.name,
                meta: {
                  kind: "imf_facility",
                  settlementId: key,
                  principalAnchor: split.principalPortion,
                  interestAnchor: split.interestPortion,
                  interestCashNative: -split.interestPortion * rate,
                  interestCashAnchor: -split.interestPortion,
                },
              },
              {
                type: "bank_loan_repayment",
                turn,
                createdAt: now,
                subjectType: "corporation",
                subjectId: imf._id,
                subjectName: imf.name,
                amount: credit,
                anchorAmount: split.actualPayment,
                currencyCode: codeOf(imf),
                counterpartyType: "corporation",
                counterpartyId: corp._id,
                counterpartyName: corp.name,
                meta: {
                  kind: "imf_facility",
                  settlementId: key,
                  principalAnchor: split.principalPortion,
                  interestAnchor: split.interestPortion,
                  interestCashNative: split.interestPortion * imfRate,
                  interestCashAnchor: split.interestPortion,
                },
              },
            ],
            thresholds,
            turnLengthMinutes,
            fx
          )
        : [];
    const transition: BankingTransition = {
      key,
      kind: "imf_facility_payment",
      turn,
      currency: codeOf(corp),
      legs:
        split.actualPayment > 0
          ? [
              {
                kind: "debit",
                amount: debit,
                valuation: { currencyCode: codeOf(corp), localPerAnchor: rate },
                collection: "corporations",
                filter: {
                  _id: oid(String(corp._id)),
                  ...(corp.liquidCurrencyCode
                    ? { liquidCurrencyCode: corp.liquidCurrencyCode }
                    : {}),
                },
                path: "liquidCapital",
                note: "IMF borrower pays principal and interest",
              },
              {
                kind: "credit",
                amount: credit,
                valuation: { currencyCode: codeOf(imf), localPerAnchor: imfRate },
                collection: "corporations",
                filter: { _id: oid(String(imf._id)) },
                path: "liquidCapital",
                note: "IMF lender receives the same anchor value",
              },
            ]
          : [],
      projections: [
        {
          collection: "corporations",
          filter: { _id: oid(String(corp._id)) },
          update,
          note: "Advance the frozen anchor facility after its payment",
        },
        ...rows.map((row) => ({
          collection: "financialTxLog",
          insert: { ...row },
          note: "Publish the frozen IMF payment receipt",
        })),
      ],
      event: {
        kind: "loan.paid",
        command: "imf.facility.service",
        amount: split.actualPayment,
        meta: {
          borrowerId: String(corp._id),
          lenderId: String(imf._id),
          interestAnchor: split.interestPortion,
          principalAnchor: split.principalPortion,
          capitalizedInterestAnchor: split.interestShortfall,
        },
      },
    };
    const settled = await settleTransition(db, transition);
    if (settled.error) throw new Error(`IMF settlement remains pending: ${settled.error}`);
    if (split.actualPayment > 0) paymentsApplied++;
  }
  const reporting = await bankMoneyMovesCollection<{
    _id: string;
    event?: {
      meta?: {
        borrowerId?: string;
        lenderId?: string;
        interestAnchor?: number;
        principalAnchor?: number;
      };
    };
  }>(db)
    .find({ kind: "imf_facility_payment", turn, status: "applied" }, { projection: { event: 1 } })
    .toArray();
  const proved = new Set<string>();
  for (const row of reporting) {
    const meta = row.event?.meta;
    if (
      !meta ||
      typeof meta.interestAnchor !== "number" ||
      !Number.isFinite(meta.interestAnchor) ||
      meta.interestAnchor < 0 ||
      typeof meta.principalAnchor !== "number" ||
      !Number.isFinite(meta.principalAnchor) ||
      meta.principalAnchor < 0 ||
      !meta.borrowerId ||
      !meta.lenderId
    )
      continue;
    proved.add(meta.borrowerId);
    const borrower = snapshots.get(meta.borrowerId),
      lender = snapshots.get(meta.lenderId);
    if (borrower) {
      borrower.settledImfInterestPaid =
        (borrower.settledImfInterestPaid ?? 0) + meta.interestAnchor;
      borrower.settledImfPrincipalPaid =
        (borrower.settledImfPrincipalPaid ?? 0) + meta.principalAnchor;
    }
    if (lender) {
      lender.settledImfInterestReceived =
        (lender.settledImfInterestReceived ?? 0) + meta.interestAnchor;
      lender.settledImfPrincipalReceived =
        (lender.settledImfPrincipalReceived ?? 0) + meta.principalAnchor;
    }
  }
  for (const corp of borrowers) {
    if (corp._id.equals(imf._id) || proved.has(String(corp._id))) continue;
    const snapshot = snapshots.get(String(corp._id));
    if (snapshot) snapshot.imfSettlementUnavailable = true;
    const lender = snapshots.get(String(imf._id));
    if (lender) lender.imfSettlementUnavailable = true;
  }
  // Read the landed balances rather than subtracting a payment again on replay.
  const balances = await corporationsCollection(db)
    .find(
      { _id: { $in: [imf._id, ...borrowers.map((corp) => corp._id)] } },
      { projection: { liquidCapital: 1 } }
    )
    .toArray();
  for (const row of balances) {
    const snapshot = snapshots.get(String(row._id));
    if (snapshot) snapshot.liquidCapital = row.liquidCapital;
  }
  return { paymentsApplied };
}
