import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { PRIVATIZATION_BUYOUT_PREMIUM } from "@/lib/constants/corporations";
import {
  anchorToCorpCapital,
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  loadFxRatesByCurrency,
} from "@/lib/currency/corporationCapital";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import {
  applyBankNavFloor,
  bankNavFloorPerShareAnchor,
  takeoverBankNav,
} from "../takeovers/rules/bankNavFloor";
import { referenceValuation } from "../acquisitions/referenceValuation";
import { unplacedIpoShares } from "@/lib/corporations/rules/dividendShares";

export type PrivatizationPriceBasis = "market" | "bankNav" | "assetValue";

export interface PrivatizationQuote {
  currency: string;
  nonCeoShares: number;
  /** Share price plus the buyout premium, rounded to cents, before any floor. */
  marketPrice: number;
  /** Price the vote locks and the buyout pays, after the bank and asset floors. */
  lockedBuyoutPrice: number;
  /** Cash reserved from the CEO: `nonCeoShares` x `lockedBuyoutPrice`, rounded up. */
  totalReservedCash: number;
  priceBasis: PrivatizationPriceBasis;
  bankNavFloorApplied: boolean;
}

/**
 * The price and reservation a take-private vote would lock right now. The vote
 * opener and the CEO's quote screen both read this, so the shown figures are the
 * ones execution uses.
 */
export async function quotePrivatizationBuyout(
  db: Db,
  corporation: Corporation,
  ceoShares: number
): Promise<PrivatizationQuote> {
  const nonCeoShares = Math.max(
    0,
    corporation.totalShares - ceoShares - unplacedIpoShares(corporation)
  );
  const lockedCurrency = corporation.liquidCurrencyCode ?? "USD";

  // Round to two decimal places to avoid float drift through later arithmetic.
  const marketPrice =
    Math.round(corporation.sharePrice * (1 + PRIVATIZATION_BUYOUT_PREMIUM) * 100) / 100;
  // A take-private forces out the minority like a squeeze-out, so it shares the bank-NAV floor.
  // Inert without an active charter; a missing floor fails open to the market price, never zero.
  let lockedBuyoutPrice = marketPrice;
  let priceBasis: PrivatizationPriceBasis = "market";
  let bankNavFloorApplied = false;
  const activeCharter =
    corporation.bankCharter?.status === "active" ? corporation.bankCharter : null;
  if (activeCharter) {
    try {
      const fxByCurrency = await loadFxRatesByCurrency(db);
      const bankCurrency = activeCharter.currency;
      let playerDepositsAreLiabilities = false;
      try {
        const bankingPolicy = await loadBankingPolicy(db);
        playerDepositsAreLiabilities = bankCurrency
          ? savingsReadsAuthoritative(bankingPolicy, bankCurrency)
          : false;
      } catch {
        playerDepositsAreLiabilities = false;
      }
      const navAnchor = corpCapitalToAnchor(
        takeoverBankNav(activeCharter, { playerDepositsAreLiabilities }),
        bankCurrency,
        bankCurrency ? (fxByCurrency.get(bankCurrency) ?? 1) : 1
      );
      const floorLocked = anchorToCorpCapital(
        bankNavFloorPerShareAnchor({
          bankNavAnchor: navAnchor,
          totalShares: corporation.totalShares ?? 0,
        }),
        lockedCurrency,
        fxRateForCorpFromMap(corporation, fxByCurrency)
      );
      const floored = applyBankNavFloor(marketPrice, floorLocked);
      if (floored.floorApplied) {
        lockedBuyoutPrice = Math.round(floored.pricePerShareAnchor * 100) / 100;
        bankNavFloorApplied = true;
        priceBasis = "bankNav";
      }
    } catch {
      // Floor infra unavailable: proceed at the market locked price.
    }
  }
  const assetFloor = await referenceValuation(db, corporation);
  if (assetFloor.minimumPriceAnchor > 0) {
    const assetFloorFx = await loadFxRatesByCurrency(db);
    const assetFloorPrice = anchorToCorpCapital(
      assetFloor.minimumPriceAnchor / Math.max(1, corporation.totalShares),
      lockedCurrency,
      fxRateForCorpFromMap(corporation, assetFloorFx)
    );
    if (assetFloorPrice > lockedBuyoutPrice) {
      lockedBuyoutPrice = assetFloorPrice;
      priceBasis = "assetValue";
    }
  }
  return {
    currency: lockedCurrency,
    nonCeoShares,
    marketPrice,
    lockedBuyoutPrice,
    totalReservedCash: Math.ceil(nonCeoShares * lockedBuyoutPrice),
    priceBasis,
    bankNavFloorApplied,
  };
}

export interface PrivatizationFunding {
  affordable: boolean;
  /** Cash the CEO is short by; 0 when affordable. */
  shortfall: number;
}

/** The reservation is debited from the CEO's personal cash only, never the treasury. */
export function privatizationFunding(
  totalReservedCash: number,
  ceoPersonalCash: number
): PrivatizationFunding {
  const shortfall = Math.max(0, totalReservedCash - Math.max(0, ceoPersonalCash));
  return { affordable: shortfall === 0, shortfall };
}
