import type { Db } from "mongodb";
import type { Bond, CentralBank, Corporation, CorporateSector } from "@/lib/db/types";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { BOND_UNIT_FACE_VALUE } from "@/lib/constants/bonds";
import { getPublicShareQuote } from "@/lib/corporations/marketQuote";
import { loadCorporationFundPortfolio } from "@/lib/indexFunds/corporationPortfolio";
import { findImfFacilityReceivablesForLender } from "@/lib/corporations/imfPortfolioReceivables";
import { bankBookEquity } from "@/lib/banking/valuation";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import { buildPrimeRateMap } from "@/lib/bonds/corporateBondDefault";
import { sectorExitValueAnchor } from "@/lib/bonds/sectorExitBasis";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { getGameState } from "@/lib/gameState";
import { computeWholeCorpValuation } from "@/lib/nationalization/compensation";
import {
  corpCapitalToAnchor,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  loadFxRatesByCurrency,
  fxRateForCorpFromMap,
} from "@/lib/currency/corporationCapital";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { acquisitionBalanceSheet } from "./rules";

export interface ReferenceValuation {
  /** Canonical whole-corp reference valuation (₳). */
  valuationAnchor: number;
  /** The target's cash (₳). */
  liquidCapitalAnchor: number;
  /** Exit value of the target's sectors (₳). */
  sectorNpvAnchor: number;
  portfolioAnchor: number;
  bankEquityAnchor: number;
  debtAnchor: number;
  minimumPriceAnchor: number;
}

/** Canonical whole-corp reference valuation (₳) for display + a fair-value anchor. */
export async function referenceValuationAnchor(db: Db, target: Corporation): Promise<number> {
  return (await referenceValuation(db, target)).valuationAnchor;
}

/** The reference valuation with the balance-sheet parts it was built from. */
export async function referenceValuation(db: Db, target: Corporation): Promise<ReferenceValuation> {
  const [sectors, centralBanks, fxByCurrency, targetFxRate, marketMode, gameState] =
    await Promise.all([
      db
        .collection<CorporateSector>("corporateSectors")
        .find({ corporationId: target._id })
        .toArray(),
      db.collection<CentralBank>("centralBanks").find({}).toArray(),
      loadFxRatesByCurrency(db),
      getCorpFxRate(db, target),
      getMarketSystemModeForDb(db),
      getGameState(db),
    ]);
  const primeMap = buildPrimeRateMap(centralBanks);
  // D11 — the sector leg of balance-sheet equity is replacement-cost BOOK under
  // plants. An acquirer buying a corp whose value is its plants must be quoted
  // the plants, not a capitalized earnings stream that the same tier already
  // stopped using for every other exit (dissolution, restructuring, taking).
  const sectorNpvAnchor = sectorExitValueAnchor(sectors, primeMap, target, fxByCurrency, {
    plantsEnabled: marketAtLeast(marketMode, "plants"),
    currentYear: gameState?.currentYear,
    currentTurn: gameState?.currentTurn,
    eraUnitScale: await loadWorldEraUnitScale(db),
    excludeGrowthCost: true,
  });
  const liquidCapitalAnchor = corpLiquidCapitalToAnchor(
    (target.liquidCapital ?? 0) + Math.max(0, target.shareEscrowBalance ?? 0),
    target,
    targetFxRate
  );
  const [bonds, heldCorps, funds, receivables] = await Promise.all([
    db
      .collection<Bond>("bonds")
      .find({
        matured: false,
        $or: [{ corporationId: target._id }, { "holders.corporationId": target._id }],
      })
      .toArray(),
    db
      .collection<Corporation>("corporations")
      .find(
        { "shareholders.corporationId": target._id },
        { projection: { shareholders: 1, sharePrice: 1, countryId: 1, liquidCurrencyCode: 1 } }
      )
      .toArray(),
    loadCorporationFundPortfolio(db, target._id),
    findImfFacilityReceivablesForLender(db, target._id),
  ]);
  const bondRate = (bond: Bond) => {
    const currency = (bond.currencyCode ??
      COUNTRY_CURRENCY_MAP[bond.countryId as keyof typeof COUNTRY_CURRENCY_MAP] ??
      "USD") as CurrencyCode;
    return fxByCurrency.get(currency) ?? 1;
  };
  let bankEquityAnchor = 0;
  if (target.bankCharter?.status === "active") {
    const currency = target.bankCharter.currency;
    const policy = await loadBankingPolicy(db);
    bankEquityAnchor = corpCapitalToAnchor(
      bankBookEquity(target.bankCharter, {
        playerDepositsAreLiabilities: currency
          ? savingsReadsAuthoritative(policy, currency)
          : false,
      }),
      currency,
      currency ? (fxByCurrency.get(currency) ?? 1) : 1
    );
  }
  const { portfolioAnchor, debtAnchor, minimumPriceAnchor } = acquisitionBalanceSheet({
    cashAnchor: liquidCapitalAnchor,
    sectorsAnchor: sectorNpvAnchor,
    bankEquityAnchor,
    fundsAnchor: funds.valueAnchor,
    receivablesAnchor: receivables.totalPrincipal,
    facilityDebtLocal: target.imfFacilityPrincipalOutstanding ?? 0,
    facilityFxRate: targetFxRate,
    issuedBonds: bonds
      .filter((b) => b.corporationId?.equals(target._id))
      .map((b) => ({ principalLocal: b.totalIssued, fxRate: bondRate(b) })),
    heldBonds: bonds
      .filter((b) => !b.corporationId?.equals(target._id))
      .flatMap((b) =>
        (b.holders ?? [])
          .filter((h) => h.corporationId?.equals(target._id))
          .map((h) => ({
            units: h.units,
            faceValue: BOND_UNIT_FACE_VALUE,
            marketPrice: b.marketPrice,
            fxRate: bondRate(b),
          }))
      ),
    heldShares: heldCorps
      .filter((c) => !c._id.equals(target._id))
      .flatMap((c) =>
        (c.shareholders ?? [])
          .filter((h) => h.corporationId?.equals(target._id))
          .map((h) => ({
            shares: h.shares,
            sharePrice: getPublicShareQuote(c),
            fxRate: fxRateForCorpFromMap(c, fxByCurrency),
          }))
      ),
  });
  const sharePriceAnchor = corpLiquidCapitalToAnchor(target.sharePrice ?? 0, target, targetFxRate);
  const valuationAnchor = computeWholeCorpValuation({
    sharePrice: sharePriceAnchor,
    totalShares: target.totalShares ?? 0,
    balanceSheetEquity: minimumPriceAnchor,
    debt: 0, // Liabilities have already been deducted from the net asset floor.
  });
  return {
    valuationAnchor,
    liquidCapitalAnchor,
    sectorNpvAnchor,
    portfolioAnchor,
    bankEquityAnchor,
    debtAnchor,
    minimumPriceAnchor,
  };
}
