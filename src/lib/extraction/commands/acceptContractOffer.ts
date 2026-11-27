import { withAtomicResult } from "@/lib/db/withAtomicResult";
import { creditRegionalExtractionReceipt } from "../creditRegionalExtractionReceipt";
import { regionalBudgetsCollection } from "@/lib/db/repositories/regionalBudgets";
import { isGovernmentContractsEnabled } from "@/lib/governmentContracts/featureFlag";
import { GOVERNMENT_CONTRACTS_DISABLED_MESSAGE } from "@/lib/governmentContracts/rules/featureGate";
import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types/corporation";
import type { ExtractionContract } from "@/lib/db/types/extractionContract";

import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { getExtractionContractsCollection } from "@/lib/db/collections/extractionContracts";
import {
  getCorpFxRate,
  anchorToCorpLiquidCapital,
  resolveCorpLiquidCurrencyCode,
  loadFxRatesByCurrency,
} from "@/lib/currency/corporationCapital";
import { insufficientCapitalMessage } from "@/lib/currency/insufficientCapitalMessage";
import { creditTreasury } from "@/lib/budget/treasurySpend";
import { emitTx } from "@/lib/financialTxLog/emit";
import { CONTRACT_TERM_TURNS_MIN } from "@/lib/constants/prospecting";
import { loadTreasuryCashContext } from "@/lib/nationalization/treasuryLedger";
import { settleTransition, resumeSettlement } from "@/lib/banking/settlementJournal";
import { oid, type BankingTransition } from "@/lib/banking/rules/boundary";
import { treasuryAnchorValuation } from "@/lib/budget/rules/treasuryAccrual";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";

export type AcceptContractResult =
  | { ok: true; status: 200; activatedTurn: number; expiresTurn: number; signingFeeLocal: number }
  | { ok: false; status: number; error: string };

export async function acceptContractOffer(
  db: Db,
  contract: ExtractionContract,
  corporation: Corporation,
  turn: number,
  now: Date,
  treasuryCashLedgerEnabled = false
): Promise<AcceptContractResult> {
  return withAtomicResult(db, async (tx) => {
    const fresh = await (await getExtractionContractsCollection(tx)).findOne({ _id: contract._id });
    const payer = await corporationsCollection(tx).findOne({ _id: corporation._id });
    if (!fresh || !payer)
      return { ok: false, status: 404, error: "Contract or corporation no longer exists." };
    return acceptInTransaction(tx, fresh, payer, turn, now, treasuryCashLedgerEnabled);
  });
}

async function acceptInTransaction(
  db: Db,
  contract: ExtractionContract,
  corporation: Corporation,
  turn: number,
  now: Date,
  treasuryCashLedgerEnabled: boolean
): Promise<AcceptContractResult> {
  if (contract.status === "offered" && !(await isGovernmentContractsEnabled(db)))
    return { ok: false, status: 503, error: GOVERNMENT_CONTRACTS_DISABLED_MESSAGE };
  const existingAttempt = contract.signingFeeAttemptKey;
  const feeAnchor = contract.signingFeeAnchor ?? 0;
  const corpCode = resolveCorpLiquidCurrencyCode(corporation) ?? "USD";
  const possibleFundedFee = treasuryCashLedgerEnabled && feeAnchor > 0;
  const stateTreasuryFallback =
    possibleFundedFee && contract.grantedByLevel === "state"
      ? !(await regionalBudgetsCollection(db).findOne({
          _id: contract.stateId,
          countryId: contract.countryId,
        })) &&
        !(await stateBudgetsCollection(db).findOne(
          { _id: contract.stateId, countryId: contract.countryId },
          { projection: { _id: 1 } }
        ))
      : false;
  const fundedTreasuryFee =
    possibleFundedFee &&
    (contract.grantedByLevel === "national" || stateTreasuryFallback || !!existingAttempt);
  const fundedRetry = fundedTreasuryFee && contract.status === "active" && !!existingAttempt;
  if (contract.status !== "offered" && !fundedRetry) {
    return { ok: false, status: 409, error: "This contract is not an open offer." };
  }
  // A revoked offer keeps status:"offered" (revoke only stamps `revokedTurn`, so
  // the active-contract and headroom filters exclude it). If accept ignored that
  // stamp, a corp could sign a revoked offer: the signing fee would be charged
  // and credited to the issuer, but `activeExtractionContractFilter` requires
  // `revokedTurn` absent, so the contract would allocate zero capacity and never
  // settle — a fee paid for nothing, weaponizable by an issuer offering a fat
  // fee then revoking concurrently. Reject it here and in the atomic claim below.
  if (contract.revokedTurn != null) {
    return { ok: false, status: 409, error: "This offer has been withdrawn." };
  }
  if (
    contract.status === "offered" &&
    contract.offerExpiresTurn != null &&
    contract.offerExpiresTurn <= turn
  ) {
    return { ok: false, status: 409, error: "This offer has expired." };
  }

  const termTurns = contract.termTurns ?? CONTRACT_TERM_TURNS_MIN;
  const activatedTurn = contract.activatedTurn ?? turn;
  const expiresTurn = contract.expiresTurn ?? activatedTurn + termTurns;
  const contractsCol = await getExtractionContractsCollection(db);
  const signingFeeAttemptKey = fundedTreasuryFee
    ? (existingAttempt ?? new ObjectId().toHexString())
    : undefined;

  // 1. Atomically claim the offer (guards against a lapsed/racing double-accept).
  if (!fundedRetry) {
    const claim = await contractsCol.updateOne(
      {
        _id: contract._id,
        status: "offered",
        offerExpiresTurn: { $gt: turn },
        revokedTurn: { $exists: false },
      },
      {
        $set: {
          status: "active",
          activatedTurn,
          expiresTurn,
          updatedAt: now,
          ...(signingFeeAttemptKey ? { signingFeeAttemptKey } : {}),
        },
        $unset: { offerExpiresTurn: "" },
      }
    );
    if (claim.modifiedCount === 0) {
      return { ok: false, status: 409, error: "This offer is no longer available." };
    }
  }

  // Compensation: undo the claim so the offer stays open. Guarded on OUR
  // activatedTurn stamp so it can only revert the claim this call made.
  const revertClaim = async () => {
    await contractsCol.updateOne(
      { _id: contract._id, status: "active", activatedTurn },
      {
        $set: { status: "offered", offerExpiresTurn: contract.offerExpiresTurn, updatedAt: now },
        $unset: {
          activatedTurn: "",
          expiresTurn: "",
          ...(signingFeeAttemptKey ? { signingFeeAttemptKey: "" } : {}),
        },
      }
    );
  };

  if (fundedTreasuryFee && existingAttempt) {
    const key = `extraction-signing-fee:${existingAttempt}`;
    const prior = await bankMoneyMovesCollection<{
      _id: string;
      event?: { amount?: number };
    }>(db).findOne({ _id: key }, { projection: { _id: 1, event: 1 } });
    if (prior) {
      const resumed = await resumeSettlement(db, key);
      if ((resumed.status === "applied" || resumed.status === "replayed") && !resumed.error) {
        return {
          ok: true,
          status: 200,
          activatedTurn: contract.activatedTurn ?? turn,
          expiresTurn: contract.expiresTurn ?? turn + termTurns,
          signingFeeLocal: prior.event?.amount ?? 0,
        };
      }
      if (resumed.status === "rejected") {
        await revertClaim();
        return {
          ok: false,
          status: 402,
          error: insufficientCapitalMessage(
            "The signing fee",
            0,
            corporation.liquidCapital ?? 0,
            corpCode
          ),
        };
      }
      throw new Error(resumed.error ?? "Funded contract signing fee is incomplete");
    }
  }

  let signingFeeLocal = 0;

  if (feeAnchor > 0) {
    // 2. Charge the corp (atomic guarded debit). Any throw before/at the debit
    // must release the claim; any throw after it must also refund the corp.
    let debited = false;
    let fundedTransitionStarted = false;
    try {
      const corpFx = await getCorpFxRate(db, corporation);
      signingFeeLocal = anchorToCorpLiquidCapital(feeAnchor, corporation, corpFx);

      if (fundedTreasuryFee) {
        const cash = await loadTreasuryCashContext(db, turn);
        if (!cash?.treasuryCashLedgerEnabled || !signingFeeAttemptKey)
          throw new Error("Funded signing fee requires the enabled Treasury cash ledger");
        const countryId = contract.countryId as CountryId;
        const fxByCurrency = await loadFxRatesByCurrency(db);
        const treasuryCurrency =
          cash.treasuryCurrencies.get(countryId) ??
          (COUNTRY_CURRENCY_MAP[countryId] as CurrencyCode | undefined) ??
          "USD";
        const treasuryRate = treasuryAnchorValuation({
          countryId,
          currencyCode: treasuryCurrency,
          preset: cash.preset,
          observedRate: cash.rates.get(treasuryCurrency) ?? fxByCurrency.get(treasuryCurrency),
        }).anchorRate;
        const sourceAnchor = signingFeeLocal / corpFx;
        const treasuryLocal = sourceAnchor * treasuryRate;
        const transition: BankingTransition = {
          key: `extraction-signing-fee:${signingFeeAttemptKey}`,
          kind: "extraction_contract_signing_fee",
          turn,
          currency: corpCode as CurrencyCode,
          legs: [
            {
              kind: "debit",
              amount: signingFeeLocal,
              valuation: { currencyCode: corpCode, localPerAnchor: corpFx },
              collection: "corporations",
              filter: {
                _id: oid(corporation._id.toHexString()),
                liquidCapital: { $gte: signingFeeLocal },
              },
              path: "liquidCapital",
              note: "Pay the national extraction contract signing fee from the corporation",
            },
            {
              kind: "credit",
              amount: treasuryLocal,
              valuation: { currencyCode: treasuryCurrency, localPerAnchor: treasuryRate },
              collection: "federalBudget",
              filter: { countryId },
              path: "treasuryCashLocal",
              note: "Deliver the corporate signing fee into spendable national Treasury cash",
            },
          ],
          projections: [
            {
              collection: "federalBudget",
              filter: { countryId },
              update: { $inc: { treasuryBalance: treasuryLocal }, $set: { updatedAt: now } },
              note: "Record the funded signing fee in signed fiscal-position analytics",
            },
          ],
          event: {
            kind: "monetary.executed",
            command: "extraction.contract.signingFee",
            subjectType: "corporation",
            subjectId: corporation._id.toHexString(),
            amount: signingFeeLocal,
            meta: {
              contractId: contract._id.toHexString(),
              sourceCurrency: corpCode,
              destinationCurrency: treasuryCurrency,
              sourceLocalPerAnchor: corpFx,
              destinationLocalPerAnchor: treasuryRate,
            },
          },
        };
        fundedTransitionStarted = true;
        const settled = await settleTransition(db, transition);
        if (settled.status === "rejected") {
          await revertClaim();
          if (settled.error?.includes("guard") || settled.error?.includes("no matching")) {
            return {
              ok: false,
              status: 402,
              error: insufficientCapitalMessage(
                "The signing fee",
                signingFeeLocal,
                corporation.liquidCapital ?? 0,
                corpCode
              ),
            };
          }
          throw new Error(settled.error ?? "Funded signing fee was rejected");
        }
        if ((settled.status !== "applied" && settled.status !== "replayed") || settled.error)
          throw new Error(settled.error ?? "Funded signing fee is incomplete");
        debited = true;
      } else {
        const debit = await corporationsCollection(db).updateOne(
          { _id: corporation._id, liquidCapital: { $gte: signingFeeLocal } },
          { $inc: { liquidCapital: -signingFeeLocal }, $set: { updatedAt: now } }
        );
        if (debit.modifiedCount === 0) {
          await revertClaim();
          return {
            ok: false,
            status: 402,
            error: insufficientCapitalMessage(
              "The signing fee",
              signingFeeLocal,
              corporation.liquidCapital ?? 0,
              corpCode
            ),
          };
        }
        debited = true;
      }

      // 3. Credit the issuer in its local currency.
      const countryId = contract.countryId as CountryId;
      const countryCode = COUNTRY_CURRENCY_MAP[countryId] as CurrencyCode | undefined;
      const fxByCurrency = await loadFxRatesByCurrency(db);
      const countryFx = countryCode ? (fxByCurrency.get(countryCode) ?? 1) : 1;
      const feeIssuerLocal = Math.round(feeAnchor * countryFx);

      let creditedNationalTreasury = false;
      if (contract.grantedByLevel === "national") {
        if (!fundedTreasuryFee) await creditTreasury(db, countryId, feeIssuerLocal);
        creditedNationalTreasury = true;
      } else {
        if (
          !(await creditRegionalExtractionReceipt(db, contract.stateId, countryId, feeIssuerLocal))
        ) {
          if (!fundedTreasuryFee) await creditTreasury(db, countryId, feeIssuerLocal);
          creditedNationalTreasury = true;
        }
      }

      await emitTx(db, {
        type: "contract_signing_fee",
        turn,
        createdAt: now,
        subjectType: "corporation",
        subjectId: corporation._id,
        subjectName: corporation.name ?? "Corporation",
        amount: -signingFeeLocal,
        currencyCode: corpCode as CurrencyCode,
        anchorAmount: -feeAnchor,
        meta: {
          contractId: contract._id.toString(),
          stateId: contract.stateId,
          resource: contract.resource,
          grantedByLevel: contract.grantedByLevel,
        },
      });
      // Paired government receipt — ONLY when the national treasury was
      // credited (federalBudget.treasuryBalance is the sole ledger-backed
      // government balance; state-budget credits stay single-sided). Same
      // convention as corp_tax_paid ↔ gov_tax_revenue.
      if (creditedNationalTreasury) {
        await emitTx(db, {
          type: "govt_signing_fee_receipt",
          turn,
          createdAt: now,
          subjectType: "government",
          countryId,
          subjectName: `${countryId} Government`,
          amount: feeIssuerLocal,
          currencyCode: (countryCode ?? "USD") as CurrencyCode,
          anchorAmount: feeAnchor,
          meta: {
            contractId: contract._id.toString(),
            stateId: contract.stateId,
            resource: contract.resource,
            grantedByLevel: contract.grantedByLevel,
          },
        });
      }
    } catch (error) {
      if (fundedTransitionStarted) throw error;
      // Post-claim failure: refund the corp if the debit landed, then release
      // the claim. The refund is additive ($inc), so it needs no affordability
      // guard; the claim revert is guarded on our activatedTurn stamp.
      if (debited) {
        await corporationsCollection(db).updateOne(
          { _id: corporation._id },
          { $inc: { liquidCapital: signingFeeLocal }, $set: { updatedAt: now } }
        );
      }
      await revertClaim();
      throw error;
    }
  }

  return { ok: true, status: 200, activatedTurn, expiresTurn, signingFeeLocal };
}
