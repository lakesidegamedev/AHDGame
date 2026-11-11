import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { withFundedNationalBalances } from "@/lib/market/producerMarket/loadFundedCountryBooks";
import {
  fundedReachableBookEntries,
  type WithNationalBalanceSource,
} from "@/lib/market/producerMarket/fundedCountryViewRules";
import { handleRouteError } from "@/lib/api/errors";
import { getGameState } from "@/lib/gameState";
import { getAuthUser } from "@/lib/auth";
import { getEnabledCountryIds } from "@/lib/countryAccess";
import type { CountryId } from "@/lib/constants/countries";
import { getCountryForExchange } from "@/lib/constants/exchangeRegistry";
import { groupStatesByCountry } from "@/lib/commodity-map/commodityRegionMappings";
import type { CommodityPrice, CommodityPriceHistory, State } from "@/lib/db/types";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  COMMODITY_TYPES,
  COMMODITY_LABELS,
  COMMODITY_ICONS,
  COMMODITY_COLORS,
  COMMODITY_BASE_PRICES,
  COMMODITY_UNITS,
} from "@/lib/constants/commodities";
import { computeRollingAnnualizedPercentChange } from "@/lib/utils/rollingAnnualizedChange";
import { conditionalJson } from "@/lib/api/conditionalJson";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { stateShortage } from "@/lib/market/rules/stateShortage";
import { loadReachableBooks, reachableBooksFor } from "@/lib/trade/queries/loadReachableBooks";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * GET /api/commodities?exchange=nyse|ftse
 * Returns all commodity prices with global and regional supply/demand.
 * Optionally filtered to states relevant to a specific exchange.
 */
export async function GET(request: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get("exchange")?.toLowerCase();
    // Opt-in enrichment for the shortage heat map's scope lens: adds full
    // per-state and per-country supply/demand/price maps, plus the per-country
    // reachable books, so the client can switch Global/Reachable/Country/State
    // without refetching. Default response shape is untouched (the table fetch
    // stays byte-identical).
    const scopeFull = searchParams.get("scope") === "full";

    // Filter by country access: NYSE→US, FTSE→UK
    const authUser = await getAuthUser();
    const isAdmin = authUser?.isAdmin === true;
    if (!isAdmin) {
      const enabledCountries = await getEnabledCountryIds();
      const requiredCountry = exchange ? getCountryForExchange(exchange) : undefined;
      if (requiredCountry && !enabledCountries.includes(requiredCountry as CountryId)) {
        return NextResponse.json({ commodities: [] });
      }
    }

    const gameState = await getGameState(db);
    const currentTurn = gameState?.currentTurn ?? 1;
    // Per-country reachable books (ticket #1077). Only the scope=full payload
    // carries them; null on a world that has not run a turn since 1.1.2, which
    // the client reads as "Reachable lens unavailable" rather than "no market".
    const reachableBooks = scopeFull ? await loadReachableBooks(db) : null;
    const targetTurn = Math.max(1, currentTurn - TURNS_PER_YEAR);
    const target24hTurn = Math.max(1, currentTurn - 24);

    const [rawPrices, historyAtOrBeforeTarget, oldestHistory, history24h] = await Promise.all([
      db.collection<CommodityPrice>("commodityPrices").find({}).toArray(),
      db
        .collection<CommodityPriceHistory>("commodityPriceHistory")
        .aggregate<{ _id: string; turn: number; globalPrice: number }>([
          { $match: { turn: { $lte: targetTurn } } },
          { $sort: { commodity: 1, turn: -1 } },
          {
            $group: {
              _id: "$commodity",
              turn: { $first: "$turn" },
              globalPrice: { $first: "$globalPrice" },
            },
          },
        ])
        .toArray(),
      db
        .collection<CommodityPriceHistory>("commodityPriceHistory")
        .aggregate<{ _id: string; turn: number; globalPrice: number }>([
          { $match: { turn: { $lte: currentTurn } } },
          { $sort: { commodity: 1, turn: 1 } },
          {
            $group: {
              _id: "$commodity",
              turn: { $first: "$turn" },
              globalPrice: { $first: "$globalPrice" },
            },
          },
        ])
        .toArray(),
      db
        .collection<CommodityPriceHistory>("commodityPriceHistory")
        .aggregate<{ _id: string; turn: number; globalPrice: number }>([
          { $match: { turn: { $lte: target24hTurn } } },
          { $sort: { commodity: 1, turn: -1 } },
          {
            $group: {
              _id: "$commodity",
              turn: { $first: "$turn" },
              globalPrice: { $first: "$globalPrice" },
            },
          },
        ])
        .toArray(),
    ]);

    // Filter state data by exchange if specified
    const exchangeCountry = exchange ? getCountryForExchange(exchange) : undefined;

    // Country figures read the funded country book of the prices' turn when
    // there is one: stored nationalDemand misses buyers with no state (public,
    // military and investment orders). See fundedCountryViewRules.
    const prices: WithNationalBalanceSource<CommodityPrice>[] =
      scopeFull || exchangeCountry
        ? await withFundedNationalBalances(db, rawPrices, gameState?.worldEpochId)
        : rawPrices.map((p) => ({ ...p, nationalBalanceSource: "modelled" as const }));

    // Build a map for quick lookup
    const priceMap = new Map(prices.map((p) => [p.commodity, p]));
    const historyAtOrBeforeTargetByCommodity = new Map(
      historyAtOrBeforeTarget.map((h) => [h._id, { turn: h.turn, globalPrice: h.globalPrice }])
    );
    const oldestHistoryByCommodity = new Map(
      oldestHistory.map((h) => [h._id, { turn: h.turn, globalPrice: h.globalPrice }])
    );
    const history24hByCommodity = new Map(
      history24h.map((h) => [h._id, { turn: h.turn, globalPrice: h.globalPrice }])
    );

    // Build state → countryId lookup for exchange filtering
    const allStates = await statesCollection(db)
      .find({})
      .project<{ _id: string; countryId: string }>({ _id: 1, countryId: 1 })
      .toArray();
    const stateCountryMap = new Map(allStates.map((s) => [s._id, s.countryId]));

    const isRelevantState = (stateId: string) => {
      if (!exchangeCountry) return true;
      return stateCountryMap.get(stateId) === exchangeCountry;
    };

    const commodities = COMMODITY_TYPES.map((commodity) => {
      const data = priceMap.get(commodity);
      // Prefer the world's OWN seeded basePrice: it is era-scaled, so a 1953
      // world would otherwise report 2019 unit prices next to its real ones.
      const basePrice = data?.basePrice ?? COMMODITY_BASE_PRICES[commodity];

      // Calculate exchange-specific supply/demand
      let exchangeSupply = 0;
      let exchangeDemand = 0;
      const relevantStatePrices: Record<string, number> = {};
      const relevantStateSupply: Record<string, number> = {};

      const fundedExchange =
        exchangeCountry && data?.fundedCountryBooks
          ? (data.fundedCountryBooks[exchangeCountry] ?? { supply: 0, demand: 0 })
          : null;
      if (fundedExchange) {
        exchangeSupply = fundedExchange.supply;
        exchangeDemand = fundedExchange.demand;
      }
      if (data) {
        for (const stateId of Object.keys(data.stateSupply)) {
          if (isRelevantState(stateId)) {
            const supply = data.stateSupply[stateId] ?? 0;
            if (!fundedExchange) {
              exchangeSupply += supply;
              exchangeDemand += data.stateDemand[stateId] ?? 0;
            }
            if (data.statePrices[stateId]) {
              relevantStatePrices[stateId] = data.statePrices[stateId];
              relevantStateSupply[stateId] = supply;
            }
          }
        }
      }

      return {
        commodity,
        label: COMMODITY_LABELS[commodity],
        icon: COMMODITY_ICONS[commodity],
        colors: COMMODITY_COLORS[commodity],
        unit: COMMODITY_UNITS[commodity],
        basePrice,
        globalPrice: data?.globalPrice ?? basePrice,
        globalSupply: data?.globalSupply ?? 0,
        globalDemand: data?.globalDemand ?? 0,
        exchangeSupply: Math.round(exchangeSupply * 100) / 100,
        exchangeDemand: Math.round(exchangeDemand * 100) / 100,
        statePrices: relevantStatePrices,
        stateSupply: relevantStateSupply,
        // Goods sold only inside each state: how many of those states are short.
        // The world figure above can read deeply short while most states are full.
        ...(isStateScopedCommodity(commodity) && data
          ? {
              stateShortage: stateShortage(
                data.stateSupply ?? {},
                data.stateDemand ?? {},
                isRelevantState
              ),
            }
          : {}),
        priceChange: (() => {
          const globalPrice = data?.globalPrice ?? basePrice;
          const reference =
            historyAtOrBeforeTargetByCommodity.get(commodity) ??
            oldestHistoryByCommodity.get(commodity);

          return computeRollingAnnualizedPercentChange({
            currentValue: globalPrice,
            referenceValue: reference?.globalPrice,
            turnSpan: reference ? currentTurn - reference.turn : 0,
          });
        })(),
        recentPriceChange: (() => {
          const globalPrice = data?.globalPrice ?? basePrice;
          const ref24h = history24hByCommodity.get(commodity);
          if (!ref24h || ref24h.globalPrice === 0) return null;
          return ((globalPrice - ref24h.globalPrice) / ref24h.globalPrice) * 100;
        })(),
        priceAttribution: data?.priceAttribution ?? null,
        turn: data?.turn ?? 0,
        // scope=full only: the complete per-state and per-country maps drive
        // the heat map's Country/State lens. Overrides the exchange-filtered
        // statePrices/stateSupply above with the unfiltered maps.
        ...(scopeFull && data
          ? {
              statePrices: data.statePrices,
              stateSupply: data.stateSupply,
              stateDemand: data.stateDemand,
              nationalSupply: data.nationalSupply ?? {},
              nationalDemand: data.nationalDemand ?? {},
              nationalPrices: data.nationalPrices ?? {},
              nationalBalanceSource: data.nationalBalanceSource,
              // Stored country -> commodity; the client's lens wants
              // commodity -> country, so pivot it here rather than shipping the
              // whole cube and re-indexing per render. A funded turn shows the
              // funded book the price phase priced from.
              reachableBooks: data.fundedCountryBooks
                ? fundedReachableBookEntries(data.fundedCountryBooks)
                : reachableBooksFor(reachableBooks, commodity),
            }
          : {}),
      };
    });

    // Per-user (enabled-country filtered) — ETag/304 keeps it live but skips the
    // body when unchanged. Not shared-cached (would leak across country access).
    // Global commodity data (no per-user fields): allow edge caching so the
    // history aggregations + full-collection scans don't run on every request,
    // while keeping the existing ETag/304 behavior. (#2818)
    // scope=full: hand the client the picker options (all countries + their
    // states) so it doesn't have to reconstruct them from sparse map keys.
    const scopeMeta = scopeFull
      ? {
          countryIds: [...new Set(allStates.map((s) => s.countryId))],
          statesByCountry: groupStatesByCountry(
            allStates.map((s) => s._id),
            Object.fromEntries(stateCountryMap)
          ),
        }
      : undefined;

    return conditionalJson(request, scopeFull ? { commodities, scopeMeta } : { commodities }, {
      cacheControl: "public, s-maxage=60, stale-while-revalidate=60",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
