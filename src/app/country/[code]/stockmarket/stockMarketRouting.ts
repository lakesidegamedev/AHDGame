import { ALL_EXCHANGES } from "@/lib/constants/exchangeRegistry";
import type { CountryId } from "@/lib/constants/countriesCore";
import { getCountryDisplayName } from "@/lib/country/countryDisplayNames";

export interface ExchangeMetaEntry {
  title: string;
  subtitle: string;
  exchangeApi: string;
}

const GLOBAL_EXCHANGE_META: ExchangeMetaEntry = {
  title: "Stock Market",
  subtitle: "All listed corporations worldwide",
  exchangeApi: "global",
};

type CountryNameResolver = (id: CountryId) => string;

/** The shell supplies the enabled countries and their runtime display names. */
export function buildRuntimeExchangeMeta(
  economyVisibleCountryIds: ReadonlySet<CountryId>,
  countryName: CountryNameResolver = getCountryDisplayName
): Record<string, ExchangeMetaEntry> {
  return {
    global: GLOBAL_EXCHANGE_META,
    ...Object.fromEntries(
      ALL_EXCHANGES.filter(({ countryId }) => economyVisibleCountryIds.has(countryId)).map(
        ({ countryId, exchangeName, apiKey }) => [
          countryId,
          {
            title: exchangeName,
            subtitle: `${exchangeName} - ${countryName(countryId)}`,
            exchangeApi: apiKey,
          },
        ]
      )
    ),
  };
}
