import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";

/**
 * Germany's map configuration.
 *
 * ⚠️ SOURCE, NOT GENERATED: the entry carries `featureIdExtractor`, an
 * arrow function, which JSON cannot hold. The snapshot records the shape
 * as function-valued with a null value, so this block is relocated by hand
 * and `commodityMapRegistry.ts` forwards to it.
 *
 * ⚠️ THE EXTRACTOR EXISTS BECAUSE GEOJSON IDS ARE NOT REGION IDS:
 * deutschlandGeoJSON features carry `properties.RS` (Regionalschluessel),
 * and `geo.id` is not reliably that. `RS_TO_DE_STATE` is the other half of
 * the same mapping and travels with it, since its only reader lives here.
 */
const RS_TO_DE_STATE: Record<string, string> = {
  "01": "SH",
  "1": "SH", // Schleswig-Holstein
  "02": "HH",
  "2": "HH", // Hamburg
  "03": "NI",
  "3": "NI", // Niedersachsen
  "04": "BRE",
  "4": "BRE", // Bremen
  "05": "NW",
  "5": "NW", // Nordrhein-Westfalen
  "06": "HE",
  "6": "HE", // Hessen
  "07": "RP",
  "7": "RP", // Rheinland-Pfalz
  "08": "BW",
  "8": "BW", // Baden-Württemberg
  "09": "BY",
  "9": "BY", // Bayern
  "10": "SL", // Saarland
  "11": "BE", // Berlin
  "12": "BB", // Brandenburg
  "13": "MV", // Mecklenburg-Vorpommern
  "14": "SN", // Sachsen
  "15": "ST", // Sachsen-Anhalt
  "16": "TH", // Thüringen
};

export const DE_MAP_REGISTRY: CountryMapConfig = {
  countryId: "DE",
  name: "Germany",
  overviewPath: "/country/de",
  mapPath: "/country/de/map",
  hasRegionMap: true,
  // isellsoap/deutschlandGeoJSON features: properties.RS = "01"–"16" (Regionalschlüssel).
  // Use a custom extractor so we always get the RS code regardless of what geo.id contains.
  geoUrl:
    "https://cdn.jsdelivr.net/gh/isellsoap/deutschlandGeoJSON@main/2_bundeslaender/4_niedrig.geo.json",
  featureIdToStateId: RS_TO_DE_STATE,
  featureIdExtractor: (geo) => String(geo.properties?.RS ?? ""),
  projection: "mercator",
  projectionCenter: [10.5, 51.2],
  projectionScale: 2200,
};
