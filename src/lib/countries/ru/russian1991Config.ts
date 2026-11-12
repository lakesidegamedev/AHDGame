import type { CountryEraOverride } from "../contract";

/**
 * January 1991 RSFSR, before the presidency existed. The 1990 Congress of
 * People's Deputies (1,068 directly elected) chose the 252-member Supreme Soviet
 * from among them; the Congress is the public electoral chamber here. Treating
 * the Supreme Soviet as a separate upper chamber would model the USSR, not the
 * RSFSR.
 *
 * The Congress and Supreme Soviet ended in the 1993 constitutional transition,
 * which needs its own runtime transition. This start config is not a permanent
 * model for a 1991-to-2027 simulation.
 */
export const RU_RUSSIAN_1991: CountryEraOverride = {
  preset: "1991-default",
  config: {
    name: "Russia",
    flagEmoji: "🇷🇺",
    executiveTitle: "Chairman of the Council of Ministers",
    headOfStateTitle: "Chairman of the Supreme Soviet",
    executiveRealmPhrase: "Russia",
    governmentType: "parliamentaryRepublic",
    governmentTypeLabel: "Transitional Parliamentary Republic",
    rulingPartyId: undefined,
    headOfStateSelection: "legislatureAppointment",
    coalitionThreshold: 535,
    regionLabel: "Economic Region",
    regionLabelPlural: "Economic Regions",
    legislature: {
      name: "Congress of People's Deputies",
      path: "/country/ru/legislature",
      bicameral: false,
      lowerChamber: {
        key: "congressOfPeoplesDeputies",
        name: "Congress of People's Deputies",
        shortName: "Congress",
        seats: 1_068,
        description:
          "1,068 deputies elected in 1990; the Congress chose the permanent Supreme Soviet from its own members.",
        elected: true,
      },
      upperChamber: undefined,
    },
    subNationalChamber: undefined,
    lowerElectionSystem: {
      termYears: 5,
      seatsContested: "all",
      singleMemberConstituencies: true,
      snapElectionsAllowed: false,
    },
    upperElectionSystem: undefined,
    electionSystems: {
      lowerChamber: "fptp",
      headOfGovernment: "parliamentary",
      headOfState: "ceremonial",
    },
    officeTypes: [
      {
        key: "primeMinister",
        label: "Chairman of the Council of Ministers",
        labelPlural: "Chairmen of the Council of Ministers",
        isExecutive: true,
        isSubNational: false,
        termYears: 5,
        actionBonus: 4,
        partyStrengthWeight: 1,
      },
      {
        key: "chairmanOfSupremeSoviet",
        label: "Chairman of the Supreme Soviet",
        labelPlural: "Chairmen of the Supreme Soviet",
        isExecutive: true,
        isHeadOfState: true,
        isSubNational: false,
        termYears: 5,
        actionBonus: 0,
        partyStrengthWeight: 0,
      },
      {
        key: "congressDeputy",
        label: "People's Deputy",
        labelPlural: "People's Deputies",
        chamberKey: "congressOfPeoplesDeputies",
        isExecutive: false,
        isSubNational: false,
        termYears: 5,
        actionBonus: 1,
        partyStrengthWeight: 0.85,
      },
    ],
    majorPartyIds: ["cpsu", "dr", "dpr"],
    priorityProfile: undefined,
  },
};
