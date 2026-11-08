/** Coupon accrual step of the bond turn. */
import type { Bond, GameConfig, Corporation } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { PartialTxEntry } from "./bondTurnLedger";
import { bondAccruesCoupon, perTurnCouponPayment } from "@/lib/constants/bonds";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { resolveBondCurrency } from "./bondTurnHelpers";
import {
  corpCapitalToAnchor,
  resolveCorpLiquidCurrencyCode,
  fxRateForCorpFromMap,
  anchorToCorpCapital,
} from "@/lib/currency/corporationCapital";
import { isCorporateBond, getBondCountryId } from "@/lib/bonds/sovereign";
import { purchaseSpreadRate } from "@/lib/currency/rules/purchaseConversion";
import { bondPoolCurrency } from "@/lib/bonds/marketPool";
import type { WithId } from "mongodb";
import type { GameState } from "@/lib/db/types";

/** Accrues this turn's coupons into the payment maps and ledger entries; returns the updated coupon totals. */
export function accrueBondCoupons({
  activeBonds,
  config,
  fxByCurrency,
  addCharPayment,
  txBondEntries,
  turn,
  now,
  addImperialPayment,
  addFundPayment,
  fundLedgerCurrency,
  corpMap,
  forexEnabled,
  gameState,
  spreadStrengths,
  corpPayments,
  corpCouponSpreadFees,
  addNppPayment,
  totalCouponsPaid,
  couponsPaid,
  addPoolCredit,
  corpCouponCosts,
  natcorpIds,
  govCouponByCountry,
}: {
  activeBonds: WithId<Bond>[];
  config:
    | (Pick<
        GameConfig,
        "treasuryCashLedgerEnabled" | "fiscalScaleStage" | "sovereignRolloverConsolidationEnabled"
      > & { captureSovereignCashProceeds?: boolean })
    | undefined;
  fxByCurrency: Map<CurrencyCode, number>;
  addCharPayment: (charIdStr: string, amountAnchor: number, bondCurrency: CurrencyCode) => void;
  txBondEntries: PartialTxEntry[];
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
  forexEnabled: boolean;
  gameState: GameState | null;
  spreadStrengths: { [k: string]: number | undefined };
  corpPayments: Map<string, number>;
  corpCouponSpreadFees: Array<{
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    fee: number;
  }>;
  addNppPayment: (
    nppIdStr: string,
    amountAnchor: number,
    _bondCurrency: CurrencyCode,
    kind: "coupon" | "maturity"
  ) => void;
  totalCouponsPaid: number;
  couponsPaid: number;
  addPoolCredit: (
    currency: CurrencyCode,
    kind: "couponsIn" | "maturitiesIn",
    local: number
  ) => void;
  corpCouponCosts: Map<string, number>;
  natcorpIds: Set<string>;
  govCouponByCountry: Map<string, { total: number; currency: CurrencyCode }>;
}) {
  for (const bond of activeBonds) {
    if (!bondAccruesCoupon(bond)) continue;
    // Funded sovereign coupon claims are paid or retained as arrears by
    // TreasuryTurn. Do not run the legacy unfunded holder and pool credits.
    if (config?.treasuryCashLedgerEnabled === true && bond.issuerType === "sovereign") continue;

    // `perTurnCouponPayment(rate, BOND_UNIT_FACE_VALUE)` returns the coupon in
    // the bond's LOCAL currency (`bond.currencyCode`, post-Task-18B). Downstream
    // consumers (addCharPayment / addImperialPayment, corpCouponCosts →
    // anchorToCorpCapital) all expect ₳, so normalize LOCAL → ₳ once per bond.
    // Without this step JP bondholders receive ~114× intended coupons per turn
    // and JP corp issuers over-deduct by the same factor — the latter cascades
    // to forced default within a handful of turns.
    const couponPerUnitLocal = perTurnCouponPayment(bond.couponRate, BOND_UNIT_FACE_VALUE);
    const bondCcy = resolveBondCurrency(bond);
    const bondFxRate = fxByCurrency.get(bondCcy) ?? 1;
    const couponPerUnitAnchor = corpCapitalToAnchor(couponPerUnitLocal, bondCcy, bondFxRate);

    // Pay each holder
    for (const holder of bond.holders) {
      const paymentAnchor = couponPerUnitAnchor * holder.units;
      if (paymentAnchor <= 0) continue;

      // Convert anchor → bondCurrency local for the tx amount + display.
      const localAmountForTx = bondFxRate > 0 ? paymentAnchor * bondFxRate : paymentAnchor;

      if (holder.characterId) {
        addCharPayment(holder.characterId.toString(), paymentAnchor, bondCcy);
        // Must log bond_coupon for character holders; omitting it leaves multi-billion coupon distributions invisible in the ledger and produces cash mismatches.
        txBondEntries.push({
          type: "bond_coupon",
          turn,
          createdAt: now,
          subjectType: "character",
          subjectId: holder.characterId,
          charId: holder.characterId.toString(),
          amount: localAmountForTx,
          currencyCode: bondCcy,
          counterpartyType: isCorporateBond(bond) ? "corporation" : "government",
          counterpartyId: isCorporateBond(bond) ? bond.corporationId : undefined,
          counterpartyName: bond.issuerName ?? "Bond issuer",
          meta: {
            bondId: String(bond._id),
            units: holder.units,
            couponRate: bond.couponRate,
          },
        });
      } else if (holder.imperialCharacterId) {
        addImperialPayment(holder.imperialCharacterId.toString(), paymentAnchor, bondCcy);
        txBondEntries.push({
          type: "bond_coupon",
          turn,
          createdAt: now,
          subjectType: "character",
          subjectId: holder.imperialCharacterId,
          charId: holder.imperialCharacterId.toString(),
          isImperial: true,
          amount: localAmountForTx,
          currencyCode: bondCcy,
          counterpartyType: isCorporateBond(bond) ? "corporation" : "government",
          counterpartyId: isCorporateBond(bond) ? bond.corporationId : undefined,
          counterpartyName: bond.issuerName ?? "Bond issuer",
          meta: {
            bondId: String(bond._id),
            units: holder.units,
            couponRate: bond.couponRate,
            imperial: true,
          },
        });
      } else if (holder.fundId) {
        const couponAnchor = addFundPayment(holder.fundId.toString(), paymentAnchor);
        // The fund credit lands on cashAnchor (₳), so the row is fund-subject in
        // the fund's own currency with the ₳ value stated outright, never
        // derived from the live FX table. Without a fund doc there is no
        // currency to book in, so the row keeps the legacy shape rather than
        // guessing.
        const couponFundIdStr = holder.fundId.toString();
        const couponFundCcy = fundLedgerCurrency(couponFundIdStr);
        if (couponFundCcy) {
          txBondEntries.push({
            type: "bond_coupon",
            turn,
            createdAt: now,
            subjectType: "fund",
            subjectId: holder.fundId,
            amount: couponAnchor,
            anchorAmount: couponAnchor,
            currencyCode: couponFundCcy,
            counterpartyType: "government",
            counterpartyName: bond.issuerName ?? "Bond issuer",
            meta: {
              bondId: String(bond._id),
              units: holder.units,
              couponRate: bond.couponRate,
              fundId: couponFundIdStr,
              fundCurrency: couponFundCcy,
              unroundedAnchorAmount: paymentAnchor,
              roundingMethod: "cumulative_fund_credit",
            },
          });
        } else {
          txBondEntries.push({
            type: "bond_coupon",
            turn,
            createdAt: now,
            subjectType: "corporation",
            subjectId: holder.fundId,
            amount: localAmountForTx,
            currencyCode: bondCcy,
            counterpartyType: "government",
            counterpartyName: bond.issuerName ?? "Bond issuer",
            meta: {
              bondId: String(bond._id),
              units: holder.units,
              couponRate: bond.couponRate,
              fundId: couponFundIdStr,
            },
          });
        }
      } else if (holder.corporationId) {
        const key = holder.corporationId.toString();
        const holderCorp = corpMap.get(key);
        const holderCurrency = (resolveCorpLiquidCurrencyCode(holderCorp) ?? "USD") as CurrencyCode;
        // Foreign coupon income converts into the corp's home currency — charge
        // the same FX spread players pay, skimmed before crediting.
        const couponSpreadRate = forexEnabled
          ? purchaseSpreadRate(
              bondCcy,
              holderCurrency,
              gameState?.euroMonetaryUnion,
              spreadStrengths
            )
          : 0;
        const couponSpreadAnchor = paymentAnchor * couponSpreadRate;
        const netCouponAnchor = paymentAnchor - couponSpreadAnchor;
        corpPayments.set(key, (corpPayments.get(key) ?? 0) + netCouponAnchor);
        if (couponSpreadAnchor > 0) {
          corpCouponSpreadFees.push({
            fromCurrency: bondCcy,
            toCurrency: holderCurrency,
            fee: localAmountForTx * couponSpreadRate,
          });
        }
        const holderFxRate = fxRateForCorpFromMap(holderCorp, fxByCurrency);
        const holderLocalAmount = anchorToCorpCapital(
          netCouponAnchor,
          resolveCorpLiquidCurrencyCode(holderCorp),
          holderFxRate
        );
        txBondEntries.push({
          type: "bond_coupon",
          turn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: holder.corporationId,
          amount: Math.round(holderLocalAmount * 100) / 100,
          currencyCode: holderCurrency,
          counterpartyType: isCorporateBond(bond) ? "corporation" : "government",
          counterpartyId: isCorporateBond(bond) ? bond.corporationId : undefined,
          counterpartyName: bond.issuerName ?? "Bond issuer",
          meta: {
            bondId: String(bond._id),
            units: holder.units,
            couponRate: bond.couponRate,
            bondCurrency: bondCcy,
            bondAmount: Math.round(localAmountForTx * 100) / 100,
            fxSpreadAnchor: couponSpreadAnchor,
          },
        });
      } else if (holder.nppId) {
        // v3 autonomous NPP bondholder coupon to its separate investment account.
        addNppPayment(holder.nppId.toString(), paymentAnchor, bondCcy, "coupon");
      } else if (holder.bankId) {
        // TreasuryTurn owns this cash leg from its frozen opening-bond plan.
        // This branch records no second bank credit.
      }

      totalCouponsPaid += paymentAnchor;
      couponsPaid++;
    }

    if (bond.publicFloat > 0) {
      addPoolCredit(bondPoolCurrency(bond), "couponsIn", couponPerUnitLocal * bond.publicFloat);
    }

    if (isCorporateBond(bond)) {
      // The coupon on pool-held units is real cost to the issuer and real income
      // to the pool (credited in Phase 6).
      // Track total coupon cost for issuing corp (₳; Phase 2 converts to issuer-local).
      const corpIdStr = bond.corporationId.toString();
      const totalUnits = bond.holders.reduce((sum, h) => sum + h.units, 0) + bond.publicFloat;
      const totalCostAnchor = couponPerUnitAnchor * totalUnits;
      corpCouponCosts.set(corpIdStr, (corpCouponCosts.get(corpIdStr) ?? 0) + totalCostAnchor);
      // Issuer-side ledger row mirrors the holder-side bond_coupon rows above
      // so each bond's coupon flow nets to zero in the ledger (modulo public
      // float). Natcorps are excluded because their coupons are government-
      // covered (no liquidCapital change in Phase 2). Zero-unit bonds (no
      // holders + no public float) skip the row — there's no actual cost.
      if (!natcorpIds.has(corpIdStr) && totalUnits > 0) {
        const issuer = corpMap.get(corpIdStr);
        const issuerCcy = resolveCorpLiquidCurrencyCode(issuer);
        const issuerRate = fxRateForCorpFromMap(issuer, fxByCurrency);
        const issuerLocalCost = anchorToCorpCapital(totalCostAnchor, issuerCcy, issuerRate);
        txBondEntries.push({
          type: "bond_coupon",
          turn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: bond.corporationId,
          amount: -Math.round(issuerLocalCost * 100) / 100,
          // USD fallback when corp lacks both `liquidCurrencyCode` and a
          // recognized `countryId` — avoids writing `currencyCode: undefined`.
          currencyCode: (issuerCcy ?? "USD") as CurrencyCode,
          meta: {
            bondId: String(bond._id),
            units: totalUnits,
            couponRate: bond.couponRate,
            source: "issuer_coupon",
          },
        });
      }
    } else {
      const sovereignCountryId = getBondCountryId(bond);
      const sovereignTotalLocal =
        couponPerUnitLocal *
        (bond.holders.reduce((sum, holder) => sum + holder.units, 0) + bond.publicFloat);
      const existingGovCoupon = govCouponByCountry.get(sovereignCountryId);
      govCouponByCountry.set(sovereignCountryId, {
        total: (existingGovCoupon?.total ?? 0) + sovereignTotalLocal,
        currency: bondCcy,
      });
    }
  }
  return { totalCouponsPaid, couponsPaid };
}
