import type { CountryEraOverride } from "../../contract";

/**
 * Differences only; unspecified fields come from base modules.
 * getCountryConfig is a shallow merge, so `legislature` replaces the whole object
 * and a partial value silently drops chamber keys, names and descriptions.
 */
export const JP_1953: CountryEraOverride = {
  preset: "1953-default",
  config: {
    usdExchangeRate: 1,
    majorPartyIds: ["ryo", "jsp"],
    coalitionThreshold: 234,
    legislature: {
      name: "Kokkai",
      path: "/country/jp/legislature",
      bicameral: true,
      upperChamber: {
        key: "sangiin",
        name: "Sangiin",
        shortName: "Sangiin",
        seats: 248,
        description:
          "248 councillors elected on staggered 6-year terms. Half are contested every 3 years. Cannot be dissolved.",
        elected: true,
      },
      lowerChamber: {
        key: "shugiin",
        name: "Shūgiin",
        shortName: "Shūgiin",
        seats: 466,
        description:
          "466 members elected in the April 1953 general election from regional constituencies.",
      },
    },
  },
};
