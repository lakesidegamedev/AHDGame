import type { CommodityType } from "@/lib/constants/commodities";
import type {
  SourcingDestinationAggregate,
  SourcingForeignQuote,
  SourcingPairAggregate,
} from "@/lib/logistics/sourcing";

function landed(ask: number, quote: SourcingForeignQuote): number {
  return (
    ask * (1 + quote.tariffRatePct / 100 + quote.shippingAskShare) +
    Math.min(quote.rawShippingPerUnit, ask * quote.shippingMaxAskShare)
  );
}

function askForLanded(value: number, quote: SourcingForeignQuote): number {
  const rate = 1 + quote.tariffRatePct / 100 + quote.shippingAskShare;
  if (!(rate > 0)) return Number.NaN;
  const cappedAsk = value / (rate + quote.shippingMaxAskShare);
  return cappedAsk * quote.shippingMaxAskShare <= quote.rawShippingPerUnit
    ? cappedAsk
    : (value - quote.rawShippingPerUnit) / rate;
}

/**
 * A sold-out export offer is not a closed domestic shortage. Limit its next
 * quote by an eligible rival with enough unsold supply to replace that route.
 * Use the rival's NEXT quote so simultaneous price updates do not cross again.
 * Allocation still uses the unchanged cheapest-landed-first sourcing pass.
 */
export function applyExportPriceFeedback(args: {
  commodity: CommodityType;
  prices: Readonly<Record<string, number>>;
  marketCountries: ReadonlySet<string>;
  destinations: readonly SourcingDestinationAggregate[];
  pairs: readonly SourcingPairAggregate[];
  quotes: readonly SourcingForeignQuote[];
}): Record<string, number> {
  const { commodity, prices, marketCountries } = args;
  const out = { ...prices };
  const exported = new Map<string, number>();
  const pairs = args.pairs.filter((p) => p.commodity === commodity && p.exporter !== p.importer);
  for (const p of pairs)
    exported.set(p.exporter, (exported.get(p.exporter) ?? 0) + p.dispatchedUnits);
  const offers = new Map(
    args.destinations
      .filter((d) => d.commodity === commodity)
      .map((d) => [d.country, d.foreignOfferUnits])
  );
  const quotesByImporter = new Map<string, Map<string, SourcingForeignQuote>>();
  for (const q of args.quotes) {
    if (q.commodity !== commodity) continue;
    let quotes = quotesByImporter.get(q.importer);
    if (!quotes) quotesByImporter.set(q.importer, (quotes = new Map()));
    quotes.set(q.exporter, q);
  }
  for (const p of pairs) {
    const offer = offers.get(p.exporter) ?? 0;
    if (
      !marketCountries.has(p.exporter) ||
      !(offer > 0) ||
      (exported.get(p.exporter) ?? 0) < offer * (1 - 1e-6)
    )
      continue;
    const quotes = quotesByImporter.get(p.importer);
    const own = quotes?.get(p.exporter);
    if (!own || !(p.dispatchedUnits > 0)) continue;
    for (const [rival, quote] of quotes!) {
      if (rival === p.exporter) continue;
      const unsold = (offers.get(rival) ?? 0) - (exported.get(rival) ?? 0);
      if (unsold + 1e-6 < p.dispatchedUnits || !(prices[rival] > 0)) continue;
      const ceiling = askForLanded(landed(prices[rival], quote), own);
      // Stay below a tied rival regardless of country-id tie breaking.
      const competitive = Math.floor((ceiling - 1e-7) * 100) / 100;
      if (Number.isFinite(competitive) && competitive > 0)
        out[p.exporter] = Math.min(out[p.exporter], competitive);
    }
  }
  return out;
}
