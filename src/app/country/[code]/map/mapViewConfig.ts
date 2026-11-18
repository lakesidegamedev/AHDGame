import type { CountryClientConfig } from "@/lib/constants/countryClientConfig";

/**
 * The slice of a country's client config a map renders: its id, display name and
 * overview link. The page resolves it on the server, so the map does not ship
 * the full 154 KB registry for three fields.
 */
export type CountryMapViewConfig = Pick<CountryClientConfig, "id" | "name" | "overviewPath">;
