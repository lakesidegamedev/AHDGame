/**
 * Legacy build advice estimates buyers from the existing commodity market book
 * and latent shortage signal. legacyBuildDemandGap preserves that calculation.
 */
import { commodityDemandGap, isStateScopedCommodity } from "@/lib/market/commodityMarketScope";
import { latentTopUpForCountry, latentTopUpForState } from "@/lib/market/latentShortageSignal";

/** Legacy-world appetite, kept separate from cash-backed funded-market advice. */
export function legacyBuildDemandGap(
  input: Parameters<typeof commodityDemandGap>[0] & {
    stateId: string;
    countryId: string;
    price?: Parameters<typeof latentTopUpForState>[0];
  }
): number {
  const latentDemandTopUp = input.price
    ? isStateScopedCommodity(input.commodity)
      ? latentTopUpForState(input.price, input.stateId)
      : latentTopUpForCountry(input.price, input.countryId)
    : 0;
  return commodityDemandGap({ ...input, latentDemandTopUp });
}
