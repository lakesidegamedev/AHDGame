/** Builds the per-bond sovereign maturity settlement plan for the bond turn. */
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { Corporation, Bond } from "@/lib/db/types";
import type { SovereignMaturityPlan } from "./bondTurnTypes";
import { resolveBondCurrency } from "./bondTurnHelpers";
import { treasuryAnchorValuation } from "@/lib/budget/rules/treasuryAccrual";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { isUnfundableOverdueMaturity } from "@/lib/bonds/sovereignMaturityWave";
import { roundSavingsAmount } from "@/lib/currency/savingsInterest";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import type { PartialTxEntry } from "./bondTurnLedger";
import { ObjectId } from "mongodb";
import {
  corpCapitalToAnchor,
  resolveCorpLiquidCurrencyCode,
  fxRateForCorpFromMap,
  anchorToCorpCapital,
} from "@/lib/currency/corporationCapital";
import { buildPersonalBalanceInc } from "@/lib/currency/characterFunds";
import { bondPoolCurrency } from "@/lib/bonds/marketPool";
import { sovereignMaturityCentralBankId } from "@/lib/bonds/sovereign";
import type { GameState } from "@/lib/db/types";
import type { SovereignMaturityWave } from "@/lib/bonds/sovereignMaturityWave";

/** Returns the planner that prices one sovereign maturity against this turn's rates and pool cash. */
export function createSovereignMaturityPlanner({
  gameState,
  authoritativeRates,
  maturityWave,
  poolCashPerFaceByCountry,
  fxByCurrency,
  forexEnabled,
  turn,
  now,
  corpMap,
  fundLedgerCurrency,
}: {
  gameState: GameState | null;
  authoritativeRates: ReadonlyMap<string, number> | null;
  maturityWave: SovereignMaturityWave;
  poolCashPerFaceByCountry: Map<string, number>;
  fxByCurrency: Map<CurrencyCode, number>;
  forexEnabled: boolean;
  turn: number;
  now: Date;
  corpMap: Map<string, Corporation>;
  fundLedgerCurrency: (fundIdStr: string) => CurrencyCode | null;
}) {
  const buildSovereignMaturityPlan = (bond: Bond): SovereignMaturityPlan | null => {
    if (!bond.countryId) return null;
    const countryId = bond.countryId;
    const bondCcy = resolveBondCurrency(bond);
    const treasuryValuation = treasuryAnchorValuation({
      countryId: countryId,
      currencyCode: bondCcy,
      preset: gameState?.preset ?? DEFAULT_SEED_PRESET,
      observedRate: authoritativeRates?.get(bondCcy),
    });
    if (!treasuryValuation || !(treasuryValuation.anchorRate > 0)) return null;

    if (isUnfundableOverdueMaturity(bond, bondCcy, maturityWave)) return null;

    const bankUnits = (bond.holders ?? []).reduce(
      (sum, holder) =>
        sum +
        (holder.bankId && Number.isSafeInteger(holder.charteredTurn)
          ? Math.max(0, holder.units)
          : 0),
      0
    );
    const bankAmountLocal = roundSavingsAmount(bankUnits * BOND_UNIT_FACE_VALUE, bondCcy);
    const totalUnits =
      (bond.holders ?? []).reduce((sum, holder) => sum + Math.max(0, holder.units), 0) +
      Math.max(0, bond.publicFloat) +
      Math.max(0, bond.centralBankHoldings ?? 0);
    const poolCashPerFace = poolCashPerFaceByCountry.get(countryId) ?? 1;
    const poolFloatFaceLocal = Math.max(0, bond.publicFloat) * BOND_UNIT_FACE_VALUE;
    const totalRepaymentLocal =
      totalUnits * BOND_UNIT_FACE_VALUE - poolFloatFaceLocal * (1 - poolCashPerFace);
    const nonBankRepaymentLocal = Math.max(0, totalRepaymentLocal - bankAmountLocal);

    const holderLegs: Array<{
      collection: string;
      filter: Record<string, unknown>;
      path: string;
      amount: number;
      currencyCode: CurrencyCode;
      localPerAnchor: number;
      note: string;
    }> = [];
    const maturityEntries: PartialTxEntry[] = [];
    const addHolderLeg = (
      collection: string,
      id: ObjectId | string,
      path: string,
      amount: number,
      currencyCode: CurrencyCode,
      localPerAnchor: number,
      note: string
    ) => {
      if (!(amount > 0)) return;
      holderLegs.push({
        collection,
        filter: { _id: id },
        path,
        amount,
        currencyCode,
        localPerAnchor,
        note,
      });
    };
    const bondFxRate = fxByCurrency.get(bondCcy) ?? 1;
    for (const holder of bond.holders ?? []) {
      if (!(holder.units > 0) || holder.bankId) continue;
      const faceAnchor =
        holder.units * corpCapitalToAnchor(BOND_UNIT_FACE_VALUE, bondCcy, bondFxRate);
      if (holder.characterId) {
        const personalPath = Object.keys(buildPersonalBalanceInc(1, bondCcy, forexEnabled))[0]!;
        addHolderLeg(
          "characters",
          holder.characterId,
          personalPath,
          holder.units * BOND_UNIT_FACE_VALUE,
          bondCcy,
          bondFxRate,
          "Pay matured sovereign bond to character"
        );
        maturityEntries.push({
          type: "bond_maturity",
          turn,
          createdAt: now,
          subjectType: "character",
          subjectId: holder.characterId,
          charId: holder.characterId.toHexString(),
          amount: holder.units * BOND_UNIT_FACE_VALUE,
          currencyCode: bondCcy,
          meta: {
            bondId: bond._id.toHexString(),
            units: holder.units,
            couponRate: bond.couponRate,
          },
        });
      } else if (holder.imperialCharacterId) {
        const personalPath = Object.keys(buildPersonalBalanceInc(1, bondCcy, forexEnabled))[0]!;
        addHolderLeg(
          "imperialCharacters",
          holder.imperialCharacterId,
          personalPath,
          holder.units * BOND_UNIT_FACE_VALUE,
          bondCcy,
          bondFxRate,
          "Pay matured sovereign bond to imperial character"
        );
        maturityEntries.push({
          type: "bond_maturity",
          turn,
          createdAt: now,
          subjectType: "character",
          subjectId: holder.imperialCharacterId,
          charId: holder.imperialCharacterId.toHexString(),
          isImperial: true,
          amount: holder.units * BOND_UNIT_FACE_VALUE,
          currencyCode: bondCcy,
          meta: {
            bondId: bond._id.toHexString(),
            units: holder.units,
            couponRate: bond.couponRate,
            imperial: true,
          },
        });
      } else if (holder.corporationId) {
        const holderCorp = corpMap.get(holder.corporationId.toHexString());
        const holderCurrency = (resolveCorpLiquidCurrencyCode(holderCorp) ?? "USD") as CurrencyCode;
        const holderFxRate = fxRateForCorpFromMap(holderCorp, fxByCurrency);
        const localAmount = anchorToCorpCapital(faceAnchor, holderCurrency, holderFxRate);
        addHolderLeg(
          "corporations",
          holder.corporationId,
          "liquidCapital",
          localAmount,
          holderCurrency,
          holderFxRate,
          "Pay matured sovereign bond to corporation"
        );
        maturityEntries.push({
          type: "bond_maturity",
          turn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: holder.corporationId,
          amount: localAmount,
          currencyCode: holderCurrency,
          meta: {
            bondId: bond._id.toHexString(),
            units: holder.units,
            couponRate: bond.couponRate,
          },
        });
      } else if (holder.fundId) {
        addHolderLeg(
          "indexFunds",
          holder.fundId,
          "cashAnchor",
          faceAnchor,
          "USD",
          1,
          "Pay matured sovereign bond to investment fund"
        );
        maturityEntries.push({
          type: "bond_maturity",
          turn,
          createdAt: now,
          subjectType: "fund",
          subjectId: holder.fundId,
          amount: faceAnchor,
          anchorAmount: faceAnchor,
          currencyCode: fundLedgerCurrency(holder.fundId.toHexString()) ?? "USD",
          meta: {
            bondId: bond._id.toHexString(),
            units: holder.units,
            couponRate: bond.couponRate,
          },
        });
      } else if (holder.nppId) {
        addHolderLeg(
          "npps",
          holder.nppId,
          "nppInvestmentCashAnchor",
          faceAnchor,
          "USD",
          1,
          "Pay matured sovereign bond to NPP investment account"
        );
      }
    }
    if (bond.publicFloat > 0) {
      addHolderLeg(
        "bondMarketPools",
        bondPoolCurrency(bond),
        "cashLocal",
        poolFloatFaceLocal * poolCashPerFace,
        bondCcy,
        bondFxRate,
        "Redeem public sovereign bond float to its funded pool"
      );
    }
    if ((bond.centralBankHoldings ?? 0) > 0) {
      addHolderLeg(
        "centralBanks",
        sovereignMaturityCentralBankId(countryId),
        "reserveBalance",
        (bond.centralBankHoldings ?? 0) * BOND_UNIT_FACE_VALUE,
        bondCcy,
        bondFxRate,
        "Redeem central-bank sovereign holdings to reserves"
      );
    }

    return {
      treasuryValuation,
      currencyCode: bondCcy,
      bankUnits,
      nonBankRepaymentLocal,
      holderLegs,
      maturityEntries,
    };
  };
  return { buildSovereignMaturityPlan };
}
