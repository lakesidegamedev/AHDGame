import type { CountryEraOverride } from "../../contract";

/**
 * Japan, 1991. DIFFERENCES ONLY; everything not named here comes from the
 * base modules.
 *
 * getCountryConfig is a SHALLOW merge, so supplying `legislature` replaces
 * the WHOLE object; a partial one silently drops chamber keys.
 *
 * `usdExchangeRate` must be the reciprocal of INITIAL_RATES_1991 (134.5
 * JPY/USD), matching the seed's stored JPY-denominated GDP. Left unset, JP
 * reads as a $4.15T economy instead of ~$3.53T.
 */
export const JP_1991: CountryEraOverride = {
  preset: "1991-default",
  config: {
    usdExchangeRate: 0.007434944237918215,
    electionSystems: {
      // The frozen `sntv-1991-v1` law snapshot still owns the historical seat
      // map and 1994 reform transition. Regional game races deliberately use
      // proportional allocation so their aggregate candidates fill that map.
      lowerChamber: "pr_hareQuota",
      upperChamber: "pr_hareQuota",
      subNationalChamber: "pr_hareQuota",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    legislature: {
      name: "Kokkai",
      path: "/country/jp/legislature",
      bicameral: true,
      upperChamber: {
        key: "sangiin",
        name: "Sangiin",
        shortName: "Sangiin",
        seats: 252,
        description:
          "252 councillors elected on staggered 6-year terms. Half are contested every 3 years. Cannot be dissolved.",
        elected: true,
      },
      lowerChamber: {
        key: "shugiin",
        name: "Shūgiin",
        shortName: "Shūgiin",
        seats: 512,
        description:
          "512 members elected from multi-member constituencies under the pre-1994 system.",
      },
    },
  },
  institutions: {
    military: {
      ordersOfBattle: [
        {
          branchId: "jgsdf",
          type: "Infantry Division",
          count: 6,
        },
        {
          branchId: "jgsdf",
          type: "Mechanized Brigade",
          count: 2,
        },
        {
          branchId: "jgsdf",
          type: "Artillery Regiment",
          count: 2,
        },
        {
          branchId: "jgsdf",
          type: "Air Defense Battalion",
          count: 2,
        },
        {
          branchId: "jmsdf",
          type: "Frigate Squadron",
          count: 5,
        },
        {
          branchId: "jmsdf",
          type: "Attack Submarine",
          count: 4,
        },
        {
          branchId: "jmsdf",
          type: "Guided-Missile Destroyer",
          count: 3,
        },
        {
          branchId: "jasdf",
          type: "Fighter Wing",
          count: 4,
        },
        {
          branchId: "jasdf",
          type: "Air Defense Wing",
          count: 2,
        },
        {
          branchId: "jasdf",
          type: "Airlift Wing",
          count: 1,
        },
      ],
    },
  },
};
