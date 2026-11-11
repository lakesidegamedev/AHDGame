import type { Db } from "mongodb";
import type { CommodityPrice } from "@/lib/db/types";
import { withFundedNationalBalances } from "@/lib/market/producerMarket/loadFundedCountryBooks";
import type { NationalBalanceSource } from "@/lib/market/producerMarket/fundedCountryViewRules";
import {
  COMMODITY_TYPES,
  COMMODITY_LABELS,
  COMMODITY_BASE_PRICES,
  COMMODITY_UNITS,
  type CommodityType,
} from "@/lib/constants/commodities";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";

/** Which source a country's supply and demand came from; null with no price row. */
function balanceSource(data: object | null | undefined): NationalBalanceSource | null {
  if (!data) return null;
  return "nationalBalanceSource" in data
    ? (data.nationalBalanceSource as NationalBalanceSource)
    : "modelled";
}

export async function queryCommodities(db: Db, params: { country?: string }) {
  const { country } = params;

  const rawPrices = await db.collection<CommodityPrice>("commodityPrices").find({}).toArray();
  // A country's figures come from the funded country book of the prices' turn
  // when there is one (see fundedCountryViewRules).
  const prices = country ? await withFundedNationalBalances(db, rawPrices) : rawPrices;
  const priceMap = new Map(prices.map((p) => [p.commodity, p]));

  const result = COMMODITY_TYPES.map((commodity) => {
    const data = priceMap.get(commodity);
    const basePrice = COMMODITY_BASE_PRICES[commodity];
    const nationalPrice =
      country && data?.nationalPrices ? (data.nationalPrices[country] ?? null) : null;
    const nationalSupply =
      country && data?.nationalSupply ? (data.nationalSupply[country] ?? null) : null;
    const nationalDemand =
      country && data?.nationalDemand ? (data.nationalDemand[country] ?? null) : null;

    return {
      key: commodity,
      label: COMMODITY_LABELS[commodity],
      unit: COMMODITY_UNITS[commodity],
      basePrice,
      globalPrice: data?.globalPrice ?? basePrice,
      globalSupply: data?.globalSupply ?? 0,
      globalDemand: data?.globalDemand ?? 0,
      ...(country !== undefined && {
        nationalPrice,
        nationalSupply,
        nationalDemand,
        nationalBalanceSource: balanceSource(data),
      }),
      priceAttribution: data?.priceAttribution ?? null,
      turn: data?.turn ?? 0,
    };
  });

  return { commodities: result };
}

export async function queryCommodityDetail(db: Db, params: { key: string; country?: string }) {
  const { key, country } = params;

  if (!COMMODITY_TYPES.includes(key as CommodityType)) return null;
  const commodity = key as CommodityType;

  const rawData = await db.collection<CommodityPrice>("commodityPrices").findOne({ commodity });
  const data = rawData && country ? (await withFundedNationalBalances(db, [rawData]))[0] : rawData;

  const basePrice = COMMODITY_BASE_PRICES[commodity];

  const statePrices = data?.statePrices ?? {};
  const stateSupply = data?.stateSupply ?? {};
  const stateDemand = data?.stateDemand ?? {};

  // Filter state-level data by country if provided
  const filterState = country
    ? async () => {
        const states = await statesCollection<Document>(db)
          .find({ countryId: country })
          .project<{ _id: string }>({ _id: 1 })
          .toArray();
        const stateIds = new Set(states.map((s) => s._id));
        const filteredPrices: Record<string, number> = {};
        const filteredSupply: Record<string, number> = {};
        const filteredDemand: Record<string, number> = {};
        for (const id of stateIds) {
          if (statePrices[id] !== undefined) filteredPrices[id] = statePrices[id];
          if (stateSupply[id] !== undefined) filteredSupply[id] = stateSupply[id];
          if (stateDemand[id] !== undefined) filteredDemand[id] = stateDemand[id];
        }
        return { prices: filteredPrices, supply: filteredSupply, demand: filteredDemand };
      }
    : async () => ({ prices: statePrices, supply: stateSupply, demand: stateDemand });

  const filtered = await filterState();

  // Top producers / consumers by state supply/demand
  const topProducers = Object.entries(filtered.supply)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([stateId, supply]) => ({ stateId, supply }));

  const topConsumers = Object.entries(filtered.demand)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([stateId, demand]) => ({ stateId, demand }));

  const nationalPrice =
    country && data?.nationalPrices ? (data.nationalPrices[country] ?? null) : null;
  const nationalSupply =
    country && data?.nationalSupply ? (data.nationalSupply[country] ?? null) : null;
  const nationalDemand =
    country && data?.nationalDemand ? (data.nationalDemand[country] ?? null) : null;

  return {
    key: commodity,
    label: COMMODITY_LABELS[commodity],
    unit: COMMODITY_UNITS[commodity],
    basePrice,
    globalPrice: data?.globalPrice ?? basePrice,
    globalSupply: data?.globalSupply ?? 0,
    globalDemand: data?.globalDemand ?? 0,
    ...(country !== undefined && {
      nationalPrice,
      nationalSupply,
      nationalDemand,
      nationalBalanceSource: balanceSource(data),
    }),
    statePrices: filtered.prices,
    stateSupply: filtered.supply,
    stateDemand: filtered.demand,
    topProducers,
    topConsumers,
    priceAttribution: data?.priceAttribution ?? null,
    turn: data?.turn ?? 0,
  };
}
