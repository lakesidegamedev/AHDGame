/** Maturity, default and principal repayment steps of the bond turn. */
import type { Bond, Corporation, GameConfig, CentralBank, FederalBudget } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { type CurrencyCode, COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import type { NotificationInput } from "@/lib/notifications";
import {
  isCorporateBond,
  getBondCountryId,
  getNationalBudgetId,
  settleSovereignBondMaturity,
} from "@/lib/bonds/sovereign";
import {
  corpCapitalToAnchor,
  resolveCorpLiquidCurrencyCode,
  fxRateForCorpFromMap,
  anchorToCorpCapital,
} from "@/lib/currency/corporationCapital";
import {
  calculateCreditScore,
  getBondCouponRate,
  CORP_BOND_DUE_SOON_REMINDER_TURNS,
  calculateBondMarketPrice,
} from "@/lib/constants/bonds";
import { corporateBondMaturityLiquidity } from "@/lib/bonds/corporateCredit";
import { applyQePriceSupport } from "@/lib/moneySupply/quantitativeEasing";
import type { PartialTxEntry } from "./bondTurnLedger";
import { resolveBondCurrency } from "./bondTurnHelpers";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { bondPoolCurrency } from "@/lib/bonds/marketPool";
import { treasuryAnchorValuation } from "@/lib/budget/rules/treasuryAccrual";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import {
  addBankMaturityClaims,
  settleBankSovereignClaims,
} from "@/lib/banking/bankSovereignClaims";
import { sovereignBondOutstanding } from "@/lib/bonds/sovereignPrincipal";

/** Marks matured and defaulted bonds and queues their status writes; returns the updated counters. */
export function resolveBondMaturitiesAndDefaults({
  activeBonds,
  corpMap,
  defaultedCorps,
  turn,
  bondOps,
  now,
  bondsDefaulted,
  newlyDefaultedIssuerCorpIds,
  maturedBonds,
  config,
  sovereignMaturityCandidateIds,
  bondsMatured,
  cbByCountry,
  activeCorporateBondsByIssuer,
  fxByCurrency,
  natcorpIds,
  notifications,
}: {
  activeBonds: WithId<Bond>[];
  corpMap: Map<string, Corporation>;
  defaultedCorps: Set<string>;
  turn: number;
  bondOps: {
    updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> };
  }[];
  now: Date;
  bondsDefaulted: number;
  newlyDefaultedIssuerCorpIds: Set<string>;
  maturedBonds: Bond[];
  config:
    | (Pick<
        GameConfig,
        "treasuryCashLedgerEnabled" | "fiscalScaleStage" | "sovereignRolloverConsolidationEnabled"
      > & { captureSovereignCashProceeds?: boolean })
    | undefined;
  sovereignMaturityCandidateIds: Set<string>;
  bondsMatured: number;
  cbByCountry: Map<CountryId, Pick<CentralBank, "_id" | "countryId" | "primeRate">>;
  activeCorporateBondsByIssuer: Map<string, Bond[]>;
  fxByCurrency: Map<CurrencyCode, number>;
  natcorpIds: Set<string>;
  notifications: NotificationInput[];
}) {
  for (const bond of activeBonds) {
    const corpIdStr = bond.corporationId.toString();
    const corp = isCorporateBond(bond) ? corpMap.get(corpIdStr) : undefined;
    const isDefaulted = isCorporateBond(bond)
      ? defaultedCorps.has(corpIdStr) || bond.defaulted
      : false;
    const isMatured = turn >= bond.maturityTurn;

    if (isDefaulted && !bond.defaulted) {
      // Mark as defaulted
      bondOps.push({
        updateOne: {
          filter: { _id: bond._id },
          update: {
            $set: {
              defaulted: true,
              defaultedAtTurn: turn,
              marketPrice: 0.1,
              updatedAt: now,
            },
          },
        },
      });
      bondsDefaulted++;
      const issuerCorpIdStr = bond.corporationId?.toString();
      if (issuerCorpIdStr) {
        newlyDefaultedIssuerCorpIds.add(issuerCorpIdStr);
      }
      continue;
    }

    if (isMatured && !bond.defaulted) {
      // A journaled bank treasury buy/sale has already reserved units out of
      // publicFloat or a bank lot. Treasury recovery runs later in BankingTurn;
      // redeeming this snapshot first would clear the pending inventory before
      // its funded cash leg can settle. Keep the bond live and retry maturity
      // on the next turn after the durable trade receipt resolves.
      if (bond.holders?.some((holder) => holder.bankTreasuryTradeId)) continue;
      // Auto-redeem at maturity: Phase 5 (below) returns face value to every
      // holder from the in-memory `bond.holders` snapshot captured here, then
      // we clear the holdings so the redeemed position does NOT linger. A
      // matured bond that kept its `holders` array would stay visible in
      // holder-based views (sovereign holdings, wealth list) while being
      // excluded from portfolio `bondValue` (which filters `matured: false`).
      // Clearing `holders` + `publicFloat` and stamping `redeemedAtTurn` makes
      // the redemption clean and idempotent (the bond leaves `activeBonds`
      // next turn via the `matured: false` filter, so it is never paid twice).
      maturedBonds.push(bond);
      if (
        config?.treasuryCashLedgerEnabled === true &&
        sovereignMaturityCandidateIds.has(bond._id.toHexString())
      ) {
        // The per-bond receipt applies retirement last, after cash and holder
        // legs. Never queue an eager bulk retirement for this path.
        continue;
      }
      bondOps.push({
        updateOne: {
          filter: { _id: bond._id },
          update: {
            $set: {
              matured: true,
              redeemedAtTurn: turn,
              marketPrice: 1.0,
              publicFloat: 0,
              holders: [],
              updatedAt: now,
            },
          },
        },
      });
      bondsMatured++;
      continue;
    }

    // Update market price based on current rates
    if (!bond.defaulted) {
      const countryId = isCorporateBond(bond)
        ? corp
          ? corp.countryId
          : getBondCountryId(bond)
        : getBondCountryId(bond);
      const cb = cbByCountry.get(countryId);
      const primeRate = cb?.primeRate ?? 2.75;

      let currentRate = primeRate;
      if (isCorporateBond(bond)) {
        // Get corp's current credit rating for effective rate
        const corpBonds = activeCorporateBondsByIssuer.get(corpIdStr) ?? [];

        // Credit math runs in ₳. Every input (liquidCapital, sharePrice × shares,
        // totalDebt, annualInterest) must be normalized to the same unit or the
        // debt/equity and interest-coverage ratios compare incoherent currencies.
        // Post-v0.2.6: bond.totalIssued is in bond.currencyCode; corp.sharePrice
        // and corp.liquidCapital are in corp.liquidCurrencyCode. Resolve each per
        // entity (bonds may straddle currencies in edge cases) and anchor-normalize.
        let totalDebt = 0;
        let annualInterest = 0;
        for (const candidate of corpBonds) {
          const bondCcy = (candidate.currencyCode ??
            (candidate.countryId && candidate.countryId in COUNTRY_CURRENCY_MAP
              ? COUNTRY_CURRENCY_MAP[candidate.countryId as keyof typeof COUNTRY_CURRENCY_MAP]
              : undefined)) as CurrencyCode | undefined;
          const bondRate = bondCcy ? (fxByCurrency.get(bondCcy) ?? 1) : 1;
          totalDebt += corpCapitalToAnchor(candidate.totalIssued, bondCcy, bondRate);
          annualInterest += corpCapitalToAnchor(
            (candidate.couponRate / 100) * candidate.totalIssued,
            bondCcy,
            bondRate
          );
        }

        const corpData = corpMap.get(corpIdStr);
        const corpCode = corpData ? resolveCorpLiquidCurrencyCode(corpData) : undefined;
        const corpRate = corpData ? fxRateForCorpFromMap(corpData, fxByCurrency) : 1;
        const corpLiquidAnchor = corpData
          ? corpCapitalToAnchor(corpData.liquidCapital, corpCode, corpRate)
          : 0;
        const sharePriceAnchor = corpData
          ? corpCapitalToAnchor(corpData.sharePrice, corpCode, corpRate)
          : 0;
        const totalEquity = corpData
          ? corpLiquidAnchor + sharePriceAnchor * (corpData.totalShares ?? 10_000_000) * 0.1
          : 1;

        const penaltyActive =
          corpData != null &&
          corpData.bondDefaultCreditPenaltyUntilTurn != null &&
          turn < corpData.bondDefaultCreditPenaltyUntilTurn;

        const creditResult = calculateCreditScore(
          corpLiquidAnchor,
          totalDebt,
          0, // We don't have per-turn income here, use 0 for conservative estimate
          annualInterest,
          totalEquity,
          {
            bondDefaultCreditPenaltyActive: !!penaltyActive,
            nearTermLiquidityScore:
              corporateBondMaturityLiquidity({
                bonds: corpBonds,
                liquidCapitalAnchor: corpLiquidAnchor,
                incomePerTurn: 0,
                annualCouponObligations: annualInterest,
                currentTurn: turn,
                fxByCurrency,
              }).liquidityScore ?? undefined,
          }
        );
        currentRate = getBondCouponRate(primeRate, creditResult.rating);
      }

      const turnsRemaining = bond.maturityTurn - turn;

      if (
        isCorporateBond(bond) &&
        turnsRemaining > 0 &&
        CORP_BOND_DUE_SOON_REMINDER_TURNS.includes(turnsRemaining) &&
        !natcorpIds.has(corpIdStr)
      ) {
        const issuer = corpMap.get(corpIdStr);
        if (issuer?.userId) {
          const weeksLabel = turnsRemaining === 1 ? "1 week" : `${turnsRemaining} weeks`;
          notifications.push({
            userId: issuer.userId,
            type: "corp_bond_due_soon",
            title: "Corporate bond nearing maturity",
            message: `${issuer.name}: principal repayment is due in about ${weeksLabel} (turn ${bond.maturityTurn}). Plan liquidity so cash on hand can cover the maturity.`,
            metadata: {
              bondId: bond._id.toString(),
              corporationId: bond.corporationId.toString(),
              ...(issuer.sequentialId != null
                ? { corporationSequentialId: issuer.sequentialId }
                : {}),
              maturityTurn: bond.maturityTurn,
              turnsRemaining,
            },
          });
        }
      }

      const newPrice = applyQePriceSupport(
        calculateBondMarketPrice(bond.couponRate, currentRate, turnsRemaining, false),
        bond.qeSupportRatio ?? 0
      );

      bondOps.push({
        updateOne: {
          filter: { _id: bond._id },
          update: { $set: { marketPrice: newPrice, updatedAt: now } },
        },
      });
    }
  }
  return { bondsDefaulted, bondsMatured };
}

/** Pays principal on every matured bond to its holders; returns the updated maturity count. */
export async function payMaturedBonds({
  maturedBonds,
  config,
  sovereignMaturityCandidateIds,
  settledSovereign,
  txBondEntries,
  bondsMatured,
  fxByCurrency,
  addPoolCredit,
  addCharPayment,
  turn,
  now,
  addImperialPayment,
  addFundPayment,
  fundLedgerCurrency,
  corpMap,
  addNppPayment,
  natcorpIds,
  notifications,
  poolLedgerContext,
  gameState,
  authoritativeRates,
  db,
  sovereignMaturityCashPaidByCountry,
  sovereignDebtFaceRetiredByCountry,
}: {
  maturedBonds: Bond[];
  config:
    | (Pick<
        GameConfig,
        "treasuryCashLedgerEnabled" | "fiscalScaleStage" | "sovereignRolloverConsolidationEnabled"
      > & { captureSovereignCashProceeds?: boolean })
    | undefined;
  sovereignMaturityCandidateIds: Set<string>;
  settledSovereign: Map<string, PartialTxEntry[] | null>;
  txBondEntries: PartialTxEntry[];
  bondsMatured: number;
  fxByCurrency: Map<CurrencyCode, number>;
  addPoolCredit: (
    currency: CurrencyCode,
    kind: "couponsIn" | "maturitiesIn",
    local: number
  ) => void;
  addCharPayment: (charIdStr: string, amountAnchor: number, bondCurrency: CurrencyCode) => void;
  turn: number;
  now: Date;
  addImperialPayment: (
    imperialIdStr: string,
    amountAnchor: number,
    bondCurrency: CurrencyCode
  ) => void;
  addFundPayment: (fundIdStr: string, paymentAnchor: number) => number;
  fundLedgerCurrency: (fundIdStr: string) => CurrencyCode | null;
  corpMap: Map<string, Corporation>;
  addNppPayment: (
    nppIdStr: string,
    amountAnchor: number,
    _bondCurrency: CurrencyCode,
    kind: "coupon" | "maturity"
  ) => void;
  natcorpIds: Set<string>;
  notifications: NotificationInput[];
  poolLedgerContext: BondPoolLedgerContext | null;
  gameState: GameState | null;
  authoritativeRates: ReadonlyMap<string, number> | null;
  db: Db;
  sovereignMaturityCashPaidByCountry: Map<string, number>;
  sovereignDebtFaceRetiredByCountry: Map<string, number>;
}) {
  for (const bond of maturedBonds) {
    if (
      config?.treasuryCashLedgerEnabled === true &&
      sovereignMaturityCandidateIds.has(bond._id.toHexString()) &&
      bond.countryId
    ) {
      const entries = settledSovereign.get(bond._id.toHexString());
      if (entries) {
        txBondEntries.push(...entries);
        bondsMatured++;
      }
      continue;
    }
    // `units × BOND_UNIT_FACE_VALUE` produces LOCAL (bond.currencyCode per
    // Task-18B). Normalize LOCAL → ₳ once per bond so both holder payouts
    // (addCharPayment re-multiplies by the bond's own FX) and issuer repayment
    // (anchorToCorpCapital expects ₳) are fed in the unit they contract for.
    const bondCcy = resolveBondCurrency(bond);
    const bondFxRate = fxByCurrency.get(bondCcy) ?? 1;
    const faceValueUnitAnchor = corpCapitalToAnchor(BOND_UNIT_FACE_VALUE, bondCcy, bondFxRate);

    // Pool-held units are redeemed at face like every other holding. The
    // corporate issuer was debited for them in Phase 2; the sovereign budget
    // retires them in settleSovereignBondMaturity below.
    if (bond.publicFloat > 0) {
      addPoolCredit(
        bondPoolCurrency(bond),
        "maturitiesIn",
        bond.publicFloat * BOND_UNIT_FACE_VALUE
      );
    }

    // Return face value to each holder
    for (const holder of bond.holders) {
      const faceValueReturnAnchor = holder.units * faceValueUnitAnchor;

      if (holder.characterId) {
        addCharPayment(holder.characterId.toString(), faceValueReturnAnchor, bondCcy);
        const fxRate = fxByCurrency.get(bondCcy) ?? 1;
        const localAmount = faceValueReturnAnchor * (fxRate > 0 ? fxRate : 1);
        txBondEntries.push({
          type: "bond_maturity",
          turn,
          createdAt: now,
          subjectType: "character",
          subjectId: holder.characterId,
          charId: holder.characterId.toString(),
          amount: localAmount,
          currencyCode: bondCcy,
          meta: { bondId: String(bond._id), units: holder.units, couponRate: bond.couponRate },
        });
      } else if (holder.imperialCharacterId) {
        addImperialPayment(holder.imperialCharacterId.toString(), faceValueReturnAnchor, bondCcy);
        const fxRate = fxByCurrency.get(bondCcy) ?? 1;
        const localAmount = faceValueReturnAnchor * (fxRate > 0 ? fxRate : 1);
        txBondEntries.push({
          type: "bond_maturity",
          turn,
          createdAt: now,
          subjectType: "character",
          subjectId: holder.imperialCharacterId,
          charId: holder.imperialCharacterId.toString(),
          isImperial: true,
          amount: localAmount,
          currencyCode: bondCcy,
          meta: {
            bondId: String(bond._id),
            units: holder.units,
            couponRate: bond.couponRate,
            imperial: true,
          },
        });
      } else if (holder.fundId) {
        const maturityAnchor = addFundPayment(holder.fundId.toString(), faceValueReturnAnchor);
        // Same fund-subject treatment as the coupon leg above.
        const maturityFundIdStr = holder.fundId.toString();
        const maturityFundCcy = fundLedgerCurrency(maturityFundIdStr);
        if (maturityFundCcy) {
          txBondEntries.push({
            type: "bond_maturity",
            turn,
            createdAt: now,
            subjectType: "fund",
            subjectId: holder.fundId,
            amount: maturityAnchor,
            anchorAmount: maturityAnchor,
            currencyCode: maturityFundCcy,
            meta: {
              bondId: String(bond._id),
              units: holder.units,
              couponRate: bond.couponRate,
              fundId: maturityFundIdStr,
              fundCurrency: maturityFundCcy,
              unroundedAnchorAmount: faceValueReturnAnchor,
              roundingMethod: "cumulative_fund_credit",
            },
          });
        } else {
          const fxRate = fxByCurrency.get(bondCcy) ?? 1;
          const localAmount = faceValueReturnAnchor * (fxRate > 0 ? fxRate : 1);
          txBondEntries.push({
            type: "bond_maturity",
            turn,
            createdAt: now,
            subjectType: "corporation",
            subjectId: holder.fundId,
            amount: localAmount,
            currencyCode: bondCcy,
            meta: {
              bondId: String(bond._id),
              units: holder.units,
              couponRate: bond.couponRate,
              fundId: maturityFundIdStr,
            },
          });
        }
      } else if (holder.corporationId) {
        // Corp-holder maturity credit was applied in Phase 1.5 / Phase 2 so it
        // could enter the default check; we only emit the ledger row here.
        const key = holder.corporationId.toString();
        const bondLocalAmount = faceValueReturnAnchor * (bondFxRate > 0 ? bondFxRate : 1);
        const holderCorp = corpMap.get(key);
        const holderCurrency = (resolveCorpLiquidCurrencyCode(holderCorp) ?? "USD") as CurrencyCode;
        const holderFxRate = fxRateForCorpFromMap(holderCorp, fxByCurrency);
        const holderLocalAmount = anchorToCorpCapital(
          faceValueReturnAnchor,
          resolveCorpLiquidCurrencyCode(holderCorp),
          holderFxRate
        );
        txBondEntries.push({
          type: "bond_maturity",
          turn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: holder.corporationId,
          amount: Math.round(holderLocalAmount * 100) / 100,
          currencyCode: holderCurrency,
          meta: {
            bondId: String(bond._id),
            units: holder.units,
            couponRate: bond.couponRate,
            bondCurrency: bondCcy,
            bondAmount: Math.round(bondLocalAmount * 100) / 100,
          },
        });
      } else if (holder.nppId) {
        // v3 autonomous NPP bondholder maturity face-value return.
        addNppPayment(holder.nppId.toString(), faceValueReturnAnchor, bondCcy, "maturity");
      }
    }

    if (isCorporateBond(bond)) {
      const totalUnitsOutstanding =
        bond.holders.reduce((sum, h) => sum + h.units, 0) + bond.publicFloat;
      const totalRepaymentAnchor = totalUnitsOutstanding * faceValueUnitAnchor;
      const issuer = corpMap.get(bond.corporationId.toString());
      const repaymentLocal = anchorToCorpCapital(
        totalRepaymentAnchor,
        resolveCorpLiquidCurrencyCode(issuer),
        fxRateForCorpFromMap(issuer, fxByCurrency)
      );
      // Issuer was already debited in Phase 2 via the unified delta; the
      // ledger row + notification still belong here for double-entry symmetry
      // with the holder rows below.

      // Issuer-side ledger row mirrors the holder-side rows above: every
      // corp-bond maturity is now double-entry visible. Pre-fix the issuer's
      // liquidCapital decrement was silent, so wealth-list reconciliation and
      // the suspect-flag scan undercounted issuer outflows by face × units.
      txBondEntries.push({
        type: "bond_maturity",
        turn,
        createdAt: now,
        subjectType: "corporation",
        subjectId: bond.corporationId,
        amount: -Math.round(repaymentLocal * 100) / 100,
        // USD fallback when corp lacks both `liquidCurrencyCode` and a
        // recognized `countryId` — avoids `currencyCode: undefined`.
        currencyCode: (resolveCorpLiquidCurrencyCode(issuer) ?? "USD") as CurrencyCode,
        meta: {
          bondId: String(bond._id),
          units: totalUnitsOutstanding,
          couponRate: bond.couponRate,
          source: "issuer_repayment",
        },
      });

      if (!natcorpIds.has(bond.corporationId.toString()) && issuer?.userId) {
        const currency = resolveCorpLiquidCurrencyCode(issuer);
        const amountLabel = Math.round(repaymentLocal).toLocaleString("en-US");
        notifications.push({
          userId: issuer.userId,
          type: "corp_bond_repaid",
          title: "Corporate bond matured",
          message: `${issuer.name}: principal was repaid this turn (about ${amountLabel} ${currency} debited from cash on hand). Charts use end-of-turn balances, so the drop matches bond settlement.`,
          metadata: {
            bondId: bond._id.toString(),
            corporationId: bond.corporationId.toString(),
            ...(issuer.sequentialId != null
              ? { corporationSequentialId: issuer.sequentialId }
              : {}),
            repaymentAnchor: totalRepaymentAnchor,
            repaymentLocal: Math.round(repaymentLocal * 100) / 100,
            currency,
          },
        });
      }
    } else if (bond.countryId) {
      const sovereignTotalUnits =
        bond.holders.reduce((sum, h) => sum + h.units, 0) +
        bond.publicFloat +
        (bond.centralBankHoldings ?? 0);
      // BOND_UNIT_FACE_VALUE is the per-unit face in the bond's LOCAL currency
      // (post-Task-18B), so `units * BOND_UNIT_FACE_VALUE` is already in
      // bondCcy — do NOT FX-convert here. Compare to the corporate-bond branch
      // above which uses `repaymentLocal` (already issuer-local-converted).
      const sovereignRepaymentLocal = sovereignTotalUnits * BOND_UNIT_FACE_VALUE;
      // Use the authoritative treasury snapshot valuation, including historical
      // budget-only rates. Validate before the cash operation lands.
      const valuation = poolLedgerContext
        ? treasuryAnchorValuation({
            countryId: bond.countryId,
            currencyCode: bondCcy,
            preset: gameState?.preset ?? DEFAULT_SEED_PRESET,
            observedRate: authoritativeRates?.get(bondCcy),
          })
        : undefined;
      const budgetId = getNationalBudgetId(bond.countryId);
      const bankMaturityClaims = await addBankMaturityClaims(db, {
        budgetId,
        countryId: bond.countryId,
        currencyCode: bondCcy,
        turn,
        bond,
        anchorRate: valuation?.anchorRate,
        ledgerShadow: poolLedgerContext !== null,
        treasuryCashLedgerEnabled: config?.treasuryCashLedgerEnabled === true,
      });
      const bankRepaymentLocal = bankMaturityClaims.reduce(
        (sum, claim) => sum + claim.amountLocal,
        0
      );
      const settlement = await settleSovereignBondMaturity(
        db,
        bond,
        sovereignRepaymentLocal,
        bankRepaymentLocal
      );
      // Missing or concurrently removed budgets do not create phantom cash history.
      if (!settlement || settlement.amountLocal === 0) continue;
      let bankMaturityPaidLocal = 0;
      if (bankMaturityClaims.length > 0) {
        const budgetWithClaims = await db
          .collection<FederalBudget>("federalBudget")
          .findOne({ _id: budgetId }, { projection: { countryId: 1, bankSovereignClaims: 1 } });
        if (budgetWithClaims?.bankSovereignClaims?.length) {
          const paid = await settleBankSovereignClaims(db, budgetWithClaims, turn);
          bankMaturityPaidLocal = bankMaturityClaims
            .filter((claim) => paid.paidClaimIds.includes(claim.id))
            .reduce((sum, claim) => sum + claim.amountLocal, 0);
        }
      }
      const treasuryCashPaidLocal =
        settlement.amountLocal - bankRepaymentLocal + bankMaturityPaidLocal;
      sovereignMaturityCashPaidByCountry.set(
        bond.countryId,
        (sovereignMaturityCashPaidByCountry.get(bond.countryId) ?? 0) + treasuryCashPaidLocal
      );
      sovereignDebtFaceRetiredByCountry.set(
        bond.countryId,
        (sovereignDebtFaceRetiredByCountry.get(bond.countryId) ?? 0) +
          sovereignBondOutstanding({
            issuerType: "sovereign",
            matured: false,
            defaulted: false,
            totalIssued: bond.totalIssued,
            restructureHaircutPercent: bond.restructureHaircutPercent ?? null,
          })
      );
      txBondEntries.push({
        type: "gov_bond_maturity_payment",
        turn,
        createdAt: now,
        subjectType: "government",
        countryId: bond.countryId,
        amount: -treasuryCashPaidLocal,
        currencyCode: settlement.currencyCode,
        ...(valuation ? { anchorAmount: -treasuryCashPaidLocal / valuation.anchorRate } : {}),
        meta: {
          bondId: String(bond._id),
          units: treasuryCashPaidLocal / BOND_UNIT_FACE_VALUE,
          couponRate: bond.couponRate,
          treasuryCashMovement: true,
          ...(valuation ?? {}),
        },
      });
    }
  }
  return { bondsMatured };
}
