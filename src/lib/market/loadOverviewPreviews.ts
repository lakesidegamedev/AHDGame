import {
  COMMODITY_BASE_PRICES,
  COMMODITY_LABELS,
  COMMODITY_TYPES,
} from "@/lib/constants/commodities";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import { stockExchangeSnapshotsCollection } from "@/lib/db/repositories/stockExchangeSnapshots";
import { getDb } from "@/lib/mongodb";
import { loadPriceCapBasis } from "./priceCapBasisLoad";
import {
  MARKET_OVERVIEW_ROWS,
  commodityOverview,
  vsBasePct,
  topStocksForPreview,
  type CommodityMover,
} from "./overviewPreview";

export async function loadOverviewPreviews() {
  const db = await getDb();
  const capBasis = await loadPriceCapBasis(db).catch(() => null);
  const [stocks, commodities] = await Promise.all([
    stockExchangeSnapshotsCollection(db)
      .findOne({ _id: "global" }, { projection: { listings: 1 } })
      .then((snapshot) =>
        topStocksForPreview(snapshot?.listings ?? [], MARKET_OVERVIEW_ROWS).map((listing) => ({
          _id: String(listing._id),
          sequentialId: listing.sequentialId,
          name: listing.name,
          tickerSymbol: listing.tickerSymbol,
          logoUrl: listing.logoUrl,
          sharePrice: listing.sharePrice,
          liquidCurrencyCode: listing.liquidCurrencyCode,
          priceChange24h: listing.priceChange24h,
        }))
      )
      .catch(() => null),
    commodityPricesCollection(db)
      .find(
        {},
        {
          projection: {
            commodity: 1,
            basePrice: 1,
            globalPrice: 1,
            globalSupply: 1,
            globalDemand: 1,
            priceAttribution: 1,
          },
        }
      )
      .toArray()
      .then((prices) => {
        const byCommodity = new Map(prices.map((price) => [price.commodity, price]));
        return commodityOverview(
          COMMODITY_TYPES.map((commodity): CommodityMover => {
            const price = byCommodity.get(commodity);
            const basePrice = price?.basePrice ?? COMMODITY_BASE_PRICES[commodity];
            return {
              commodity,
              label: COMMODITY_LABELS[commodity],
              basePrice,
              globalPrice: price?.globalPrice ?? basePrice,
              globalSupply: price?.globalSupply,
              globalDemand: price?.globalDemand,
              priceAttribution: price?.priceAttribution ?? null,
              ...(capBasis
                ? {
                    priceCapBasis: capBasis,
                    priceCeiling: basePrice * capBasis.multiplier * capBasis.nominalIndex,
                  }
                : {}),
            };
          })
        );
      })
      .catch(() => null),
  ]);
  return {
    stocks,
    movers: commodities?.movers ?? null,
    capped:
      commodities?.capped.map((c) => ({
        commodity: c.commodity,
        label: c.label,
        vsBasePct: vsBasePct(c),
      })) ?? null,
  };
}

export type MarketOverviewPreviews = Awaited<ReturnType<typeof loadOverviewPreviews>>;
