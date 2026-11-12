import type { CountryEraOverride } from "../../contract";

/*
 * Poland 2027: Third-Republic parliamentary republic on the 2023 Sejm/Senate election result.
 * Sejm: proportional (d'Hondt; approximated with pr_hareQuota). Senate: FPTP in 100 SMDs.
 * Presidency: direct popular vote, which headOfStateSelection cannot express, so left undefined.
 */
export const PL_2027: CountryEraOverride = {
  preset: "2027-default",
  config: {
    executiveTitle: "Prime Minister",
    headOfStateTitle: "President",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Parliamentary Republic",
    rulingPartyId: undefined,
    headOfStateSelection: undefined,
    coalitionThreshold: 231,
    legislature: {
      name: "National Assembly",
      path: "/country/pl/legislature",
      bicameral: true,
      lowerChamber: {
        key: "sejm",
        name: "Sejm",
        shortName: "Sejm",
        seats: 460,
        description:
          "460 deputies elected by proportional representation to four-year terms, resting on the October 2023 result.",
        elected: true,
      },
      upperChamber: {
        key: "senat",
        name: "Senate",
        shortName: "Senate",
        seats: 100,
        description:
          "100 senators elected by first-past-the-post in single-member constituencies to four-year terms.",
        elected: true,
      },
    },
    lowerElectionSystem: {
      termYears: 4,
      seatsContested: "all",
      singleMemberConstituencies: false,
      snapElectionsAllowed: true,
    },
    upperElectionSystem: {
      termYears: 4,
      seatsContested: "all",
      singleMemberConstituencies: true,
      snapElectionsAllowed: true,
    },
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Prime Minister",
        labelPlural: "Prime Ministers",
        isExecutive: true,
        isSubNational: false,
        termYears: 4,
        actionBonus: 4,
        partyStrengthWeight: 1,
      },
      {
        key: "president",
        label: "President",
        labelPlural: "Presidents",
        isExecutive: true,
        isHeadOfState: true,
        isSubNational: false,
        termYears: 5,
        actionBonus: 0,
        partyStrengthWeight: 0,
      },
      {
        key: "sejmDeputy",
        label: "Deputy",
        labelPlural: "Deputies",
        chamberKey: "sejm",
        isExecutive: false,
        isSubNational: false,
        termYears: 4,
        actionBonus: 1,
        partyStrengthWeight: 0.9,
      },
      {
        key: "senator",
        label: "Senator",
        labelPlural: "Senators",
        chamberKey: "senat",
        isExecutive: false,
        isSubNational: false,
        termYears: 4,
        actionBonus: 1,
        partyStrengthWeight: 0.8,
      },
      {
        key: "centralBankChair",
        label: "President of the NBP",
        labelPlural: "Presidents of the NBP",
        isExecutive: false,
        isSubNational: false,
        termYears: 6,
        actionBonus: 3,
        partyStrengthWeight: 0,
      },
    ],
    currencyCode: "PLN",
    // 2024 NBP average PLN per USD, matching the 2024 PLN regional GDP anchor.
    // https://nbp.pl/wp-content/uploads/2025/06/Financial-Statements-of-Narodowy-Bank-Polski-as-at-31-December-2024.pdf
    usdExchangeRate: 1 / 3.9812,
    tagline: "A Central European parliamentary republic following the 2023 election.",
    descriptor:
      "The Prime Minister governs with the confidence of the 460-seat Sejm, elected by proportional vote, alongside the 100-seat Senate and a directly elected President.",
  },
};
