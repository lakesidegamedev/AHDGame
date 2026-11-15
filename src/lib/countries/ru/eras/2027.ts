import type { CountryEraOverride } from "../../contract";

/**
 * Russia 2027 preset. Duma: 225 single-member + 225 party-list with 5%
 * threshold; approximated by the `ams` mixed-member method until a
 * parallel system exists. Presidency uses `fptp` since there is no
 * runoff method. Federation Council is not popularly elected.
 *`usdExchangeRate` is USD per ruble from 2024 World Bank GDP over
 * Rosstat RUB GDP.
 */
export const RU_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    executiveTitle: "President",
    headOfStateTitle: "President",
    governmentType: "presidential",
    governmentTypeLabel: "Presidential Federation",
    coalitionThreshold: 226,
    legislature: {
      name: "Federal Assembly",
      path: "/country/ru/legislature",
      bicameral: true,
      lowerChamber: {
        key: "stateDuma",
        name: "State Duma",
        shortName: "Duma",
        seats: 450,
        description:
          "450 deputies elected for five-year terms, with 225 single-member constituencies and 225 party-list seats subject to a 5% threshold.",
        elected: true,
      },
      upperChamber: {
        key: "federationCouncil",
        name: "Federation Council",
        shortName: "Federation Council",
        seats: 178,
        description:
          "178 members delegated two per federal subject by regional legislatures and executives; not popularly elected.",
        elected: false,
      },
    },
    lowerElectionSystem: {
      termYears: 5,
      seatsContested: "all",
      singleMemberConstituencies: true,
      snapElectionsAllowed: true,
    },
    electionSystems: {
      lowerChamber: "ams",
      headOfGovernment: "parliamentary",
      headOfState: "fptp",
    },
    headOfStateSelection: undefined,
    officeTypes: [
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isHeadOfState: true,
        isSubNational: false,
        termYears: 6,
        actionBonus: 4,
        partyStrengthWeight: 1,
      },
      {
        key: "primeMinister",
        label: "Prime Minister",
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
        actionBonus: 3,
        partyStrengthWeight: 1,
      },
      {
        key: "dumaDeputy",
        label: "Duma Deputy",
        labelPlural: "Duma Deputies",
        chamberKey: "stateDuma",
        isExecutive: false,
        isSubNational: false,
        termYears: 5,
        actionBonus: 1,
        partyStrengthWeight: 0.9,
      },
      {
        key: "federationCouncilMember",
        label: "Federation Council Member",
        labelPlural: "Federation Council Members",
        chamberKey: "federationCouncil",
        isExecutive: false,
        isSubNational: false,
        actionBonus: 1,
        partyStrengthWeight: 0.8,
      },
      {
        key: "centralBankChair",
        label: "Governor of the Bank of Russia",
        labelPlural: "Governors of the Bank of Russia",
        isExecutive: false,
        isSubNational: false,
        termYears: 5,
        actionBonus: 3,
        partyStrengthWeight: 0,
      },
    ],
    rulingPartyId: undefined,
    majorPartyIds: ["er", "kprf", "ldpr", "srzp", "np"],
    usdExchangeRate: 0.01081,
    exchangeName: "Moscow Exchange",
    exchangeKind: "market",
    centralGovernmentLabel: "Federal Government",
    executiveLabel: "Presidential Administration",
    tagline: "A transcontinental presidential federation following the 2021 Duma election.",
    descriptor:
      "The President governs with a Prime Minister accountable to the 450-seat State Duma, elected by a mixed constituency and list vote, alongside the 178-member delegated Federation Council.",
  },
};
