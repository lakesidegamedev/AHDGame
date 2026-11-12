/**
 * Legislative wants around 2000. These authored interests and bounded law levels
 * describe requests, not enacted policy or measured opinions of every group.
 * resolveLegislativePriorities combines them with regional context and bucket leans.
 */
import type { PriorityReference, PriorityTopic } from "./catalog";

export interface HistoricalPriorityTopic {
  lawTypeId: string;
  /** Explicit left/centre/right requests within this issue's historical bounds. */
  levels: readonly [string, string, string];
  axis: "economicLean" | "socialLean";
}

export interface HistoricalPriorityCountry {
  topics: Partial<Record<PriorityTopic, HistoricalPriorityTopic>>;
  groups: Record<string, readonly PriorityTopic[]>;
  regions: Record<string, readonly PriorityTopic[]>;
  groupRegions?: Record<string, Record<string, readonly PriorityTopic[]>>;
  regionalLevels?: Record<string, Partial<Record<PriorityTopic, PriorityReference>>>;
}

/** A request into the one law book: explicit left, centre and right option ids. */
function book(
  lawTypeId: string,
  axis: HistoricalPriorityTopic["axis"],
  levels: [string, string, string]
): HistoricalPriorityTopic {
  return { lawTypeId, levels, axis };
}

const noIncomeTax = Object.fromEntries(
  // NH/TN had investment-income taxes, not broad wage-income taxes. Here 0%
  // is a request to remove the remaining levy, not a claim it was absent.
  ["AK", "FL", "NH", "NV", "SD", "TN", "TX", "WA", "WY"].map((region) => [
    region,
    {
      tax: { lawTypeId: "us.tax.stateIncomeTax", policyOptionId: "rate_0" },
    },
  ])
);

/** See year2000.sources.ts for evidence, limitations and catalogue omissions. */
export const YEAR_2000_PRIORITIES: Record<string, HistoricalPriorityCountry> = {
  US: {
    topics: {
      schools: book("us.education.universalSchooling.primary", "economicLean", ["l4", "l3", "l2"]),
      health: book("us.health.outcomes.primary", "economicLean", ["l4", "l3", "l2"]),
      pensions: book("us.health.socialInsurance.primary", "economicLean", ["l3", "l3", "l2"]),
      care: book("us.health.universalCare.primary", "economicLean", ["l4", "l3", "l2"]),
      prescriptions: book("us.health.providerChoice.primary", "economicLean", ["l0", "l0", "l3"]),
      skills: book("us.education.adultSkills.primary", "economicLean", ["l4", "l3", "l2"]),
      labor: book("us.sec.laborManagementRelations", "economicLean", ["l3", "l2", "l1"]),
      family: book("us.society.womensOpportunity.primary", "economicLean", ["l3", "l2", "l1"]),
      transport: book("us.infrastructure.transit.primary", "economicLean", ["l4", "l3", "l2"]),
      housing: book("us.infrastructure.publicHousing.primary", "economicLean", ["l3", "l2", "l1"]),
      tuition: book("us.education.attainment.primary", "economicLean", ["l3", "l2", "l1"]),
      research: book("us.education.research.primary", "economicLean", ["l4", "l3", "l2"]),
      business: book("us.infrastructure.development.primary", "economicLean", ["l1", "l2", "l3"]),
      tax: book("us.tax.stateIncomeTax", "economicLean", ["rate_9", "rate_5", "rate_5"]),
      // Rural water/grid services, not food stamps as a proxy for farm policy.
      rural: book("us.infrastructure.utilities.primary", "economicLean", ["l3", "l2", "l2"]),
      environment: book("us.environment.conservation.primary", "economicLean", ["l3", "l2", "l1"]),
      rights: book("us.governance.participation.primary", "socialLean", ["l4", "l3", "l2"]),
      crime: book("us.order.communityTrust.primary", "socialLean", ["l3", "l2", "l1"]),
      reproductive: book("us.society.demography.primary", "socialLean", ["l1", "l2", "l3"]),
      firearms: book("us.order.safety.primary", "socialLean", ["l3", "l2", "l1"]),
      immigration: book("us.sec.immigrationNationality", "socialLean", ["l3", "l2", "l1"]),
    },
    groups: {
      "race:white": [
        "health",
        "schools",
        "pensions",
        "tax",
        "crime",
        "reproductive",
        "rural",
        "firearms",
      ],
      "race:black": ["schools", "health", "rights", "skills", "labor", "housing", "crime"],
      "race:hispanic": ["schools", "skills", "health", "labor", "housing", "immigration", "family"],
      "race:asian": [
        "schools",
        "skills",
        "health",
        "business",
        "immigration",
        "transport",
        "research",
      ],
      "race:other": ["schools", "health", "rights", "skills", "rural", "housing"],
      "age:young": ["skills", "schools", "tuition", "labor", "tax", "housing", "reproductive"],
      "age:mid": ["schools", "health", "tax", "family", "labor", "crime", "reproductive"],
      "age:mature": ["health", "pensions", "tax", "prescriptions", "skills", "crime"],
      "age:senior": ["pensions", "prescriptions", "health", "care", "tax", "transport"],
      "education:no_college": ["skills", "health", "labor", "schools", "tax", "crime", "firearms"],
      "education:college": [
        "schools",
        "tax",
        "health",
        "business",
        "research",
        "environment",
        "reproductive",
      ],
      "education:graduate": ["research", "schools", "health", "environment", "rights", "tax"],
      // These are income tiers, not household assets or homeownership.
      "wealth:low": ["health", "skills", "schools", "labor", "housing", "care"],
      "wealth:middle": ["schools", "tax", "health", "pensions", "family", "crime"],
      "wealth:high": ["tax", "business", "schools", "research", "health", "transport"],
    },
    regions: {
      AL: ["health", "crime"],
      AK: ["rural", "transport"],
      AZ: ["schools", "immigration"],
      AR: ["health", "rural"],
      CA: ["schools", "environment"],
      CO: ["schools", "environment"],
      CT: ["tax", "schools"],
      DE: ["business", "health"],
      DC: ["schools", "rights"],
      FL: ["prescriptions", "pensions"],
      GA: ["schools", "transport"],
      HI: ["health", "housing"],
      ID: ["rural", "tax"],
      IL: ["schools", "labor"],
      IN: ["skills", "business"],
      IA: ["rural", "schools"],
      KS: ["rural", "schools"],
      KY: ["health", "skills"],
      LA: ["health", "skills"],
      ME: ["health", "pensions"],
      MD: ["schools", "research"],
      MA: ["schools", "research"],
      MI: ["labor", "skills"],
      MN: ["schools", "health"],
      MS: ["health", "schools"],
      MO: ["skills", "schools"],
      MT: ["rural", "environment"],
      NE: ["rural", "schools"],
      NV: ["skills", "housing"],
      NH: ["tax", "schools"],
      NJ: ["tax", "schools"],
      NM: ["schools", "health"],
      NY: ["schools", "transport"],
      NC: ["schools", "skills"],
      ND: ["rural", "transport"],
      OH: ["skills", "labor"],
      OK: ["rural", "health"],
      OR: ["schools", "environment"],
      PA: ["pensions", "labor"],
      RI: ["health", "skills"],
      SC: ["schools", "skills"],
      SD: ["rural", "health"],
      TN: ["skills", "schools"],
      TX: ["schools", "business"],
      UT: ["schools", "family"],
      VT: ["health", "environment"],
      VA: ["schools", "transport"],
      WA: ["schools", "research"],
      WV: ["health", "pensions"],
      WI: ["schools", "labor"],
      WY: ["rural", "tax"],
    },
    groupRegions: {
      ID: {
        "race:white": ["health", "firearms", "rural", "schools", "tax", "pensions", "crime"],
      },
      MT: {
        "race:white": ["health", "firearms", "rural", "schools", "tax", "pensions", "crime"],
      },
      WY: {
        "race:white": ["health", "firearms", "rural", "schools", "tax", "pensions", "crime"],
      },
      CA: {
        "education:college": ["schools", "health", "environment", "tax", "research", "transport"],
      },
      MA: {
        "education:college": ["schools", "health", "research", "tax", "transport", "environment"],
      },
      MI: {
        "education:college": ["schools", "skills", "health", "tax", "business", "labor"],
      },
      WA: {
        "education:college": ["schools", "research", "transport", "tax", "health", "business"],
      },
      FL: { "race:hispanic": ["schools", "business", "tax", "health", "immigration", "family"] },
      TX: { "race:hispanic": ["schools", "skills", "health", "labor", "immigration", "housing"] },
      NM: { "race:hispanic": ["schools", "health", "skills", "rural", "rights", "labor"] },
    },
    regionalLevels: noIncomeTax,
  },
  UK: {
    topics: {
      health: book("uk.health.universalCare.primary", "economicLean", ["l4", "l3", "l3"]),
      schools: book("uk.education.universalSchooling.primary", "economicLean", ["l4", "l3", "l2"]),
      pensions: book("uk.health.socialInsurance.primary", "economicLean", ["l4", "l3", "l2"]),
      care: book("uk.sec.nationalAssistanceReform", "economicLean", ["l4", "l3", "l2"]),
      skills: book("uk.education.adultSkills.primary", "economicLean", ["l4", "l3", "l2"]),
      jobs: book("uk.economy.mobility.primary", "economicLean", ["l4", "l3", "l2"]),
      labor: book("uk.sec.industrialRelations", "economicLean", ["l3", "l2", "l1"]),
      family: book("uk.society.womensOpportunity.primary", "economicLean", ["l3", "l2", "l1"]),
      tuition: book("uk.sec.universityGrants", "economicLean", ["l3", "l3", "l2"]),
      housing: book("uk.infrastructure.publicHousing.primary", "economicLean", ["l3", "l2", "l1"]),
      transport: book("uk.infrastructure.transit.primary", "economicLean", ["l4", "l3", "l2"]),
      research: book("uk.education.research.primary", "economicLean", ["l4", "l3", "l2"]),
      business: book("uk.tax.domesticCorporateTax", "economicLean", [
        "rate_48",
        "rate_35",
        "rate_24",
      ]),
      tax: book("uk.tax.incomeTax", "economicLean", ["rate_36", "rate_24", "rate_24"]),
      rural: book("uk.sec.agricultureDeficiency", "economicLean", ["l4", "l3", "l2"]),
      environment: book("uk.environment.conservation.primary", "economicLean", ["l3", "l2", "l1"]),
      crime: book("uk.order.communityTrust.primary", "socialLean", ["l3", "l2", "l1"]),
      // Community justice/victim support, not online voting as a civil-rights proxy.
      rights: book("uk.order.courts.primary", "economicLean", ["l4", "l3", "l2"]),
      devolution: book("uk.governance.localAutonomy.primary", "socialLean", ["l3", "l2", "l2"]),
    },
    groups: {
      "ethnicity:white_british": [
        "health",
        "schools",
        "pensions",
        "crime",
        "jobs",
        "tax",
        "devolution",
      ],
      "ethnicity:asian_british": ["schools", "health", "jobs", "business", "rights", "transport"],
      "ethnicity:black_british": ["schools", "health", "jobs", "rights", "housing", "skills"],
      "ethnicity:mixed": ["schools", "health", "jobs", "rights", "housing", "transport"],
      "ethnicity:other": ["schools", "health", "jobs", "skills", "housing", "rights"],
      "age:young": ["jobs", "skills", "tuition", "health", "transport", "housing"],
      "age:mid": ["schools", "health", "jobs", "crime", "family", "tax"],
      "age:mature": ["health", "pensions", "jobs", "tax", "care", "crime"],
      "age:senior": ["health", "pensions", "care", "crime", "transport", "tax"],
      "education:no_qualifications": ["jobs", "health", "skills", "pensions", "labor", "crime"],
      "education:gcse_equivalent": ["jobs", "health", "skills", "schools", "labor", "crime"],
      "education:a_level_equivalent": [
        "skills",
        "jobs",
        "schools",
        "health",
        "tuition",
        "transport",
      ],
      "education:degree_plus": [
        "schools",
        "health",
        "research",
        "transport",
        "tax",
        "environment",
        "devolution",
      ],
      "income:low": ["health", "jobs", "skills", "schools", "housing", "labor"],
      "income:middle": ["health", "schools", "pensions", "crime", "tax", "transport"],
      "income:high": ["schools", "tax", "health", "business", "transport", "research"],
    },
    regions: {
      NEE: ["jobs", "health"],
      NWE: ["health", "jobs"],
      YHU: ["jobs", "skills"],
      EMI: ["jobs", "schools"],
      WMI: ["jobs", "schools"],
      EAE: ["schools", "health"],
      LON: ["transport", "housing"],
      SEE: ["schools", "transport"],
      SWE: ["rural", "care"],
      SCO: ["devolution", "health"],
      WAL: ["jobs", "health"],
      NIR: ["rights", "devolution"],
    },
    groupRegions: {
      SCO: {
        "age:young": ["tuition", "jobs", "skills", "health", "transport", "devolution"],
        "education:a_level_equivalent": [
          "tuition",
          "skills",
          "jobs",
          "schools",
          "health",
          "devolution",
        ],
      },
      NIR: {
        "ethnicity:white_british": ["devolution", "rights", "jobs", "health", "schools", "crime"],
      },
    },
    // An aspiration to retain fee abolition and oppose the graduate endowment,
    // not a claim that universal maintenance grants were enacted in Scotland.
    regionalLevels: {
      SCO: { tuition: { lawTypeId: "uk.sec.universityGrants", policyOptionId: "l4" } },
    },
  },
  JP: {
    topics: {
      jobs: book("jp.economy.mobility.primary", "economicLean", ["l4", "l3", "l2"]),
      business: book("jp.sec.exportCreditsAndSmallFirms", "economicLean", ["l4", "l3", "l2"]),
      skills: book("jp.education.adultSkills.primary", "economicLean", ["l4", "l3", "l2"]),
      labor: book("jp.sec.enterpriseUnionBargaining", "economicLean", ["l3", "l2", "l1"]),
      health: book("jp.health.universalCare.primary", "economicLean", ["l4", "l3", "l2"]),
      pensions: book("jp.health.socialInsurance.primary", "economicLean", ["l4", "l3", "l2"]),
      care: book("jp.sec.pensionCoverageExtension", "economicLean", ["l4", "l3", "l2"]),
      schools: book("jp.education.universalSchooling.primary", "economicLean", ["l4", "l3", "l2"]),
      tuition: book("jp.sec.universityFunding", "economicLean", ["l3", "l3", "l2"]),
      research: book("jp.education.research.primary", "economicLean", ["l4", "l3", "l2"]),
      family: book("jp.sec.parentalLeaveAndChildcare", "economicLean", ["l3", "l2", "l1"]),
      tax: book("jp.tax.incomeTax", "economicLean", ["rate_45", "rate_33", "rate_22"]),
      rural: book("jp.sec.agriculturalSupport", "economicLean", ["l4", "l3", "l2"]),
      transport: book("jp.infrastructure.transit.primary", "economicLean", ["l4", "l3", "l2"]),
      disaster: book("jp.sec.disasterPreparedness", "economicLean", ["l4", "l3", "l2"]),
      environment: book("jp.environment.conservation.primary", "economicLean", ["l3", "l2", "l1"]),
      rights: book("jp.society.womensOpportunity.primary", "socialLean", ["l4", "l3", "l2"]),
      immigration: book("jp.sec.migrationAndResidence", "socialLean", ["l4", "l3", "l2"]),
    },
    groups: {
      "ethnicity:japanese": [
        "jobs",
        "pensions",
        "health",
        "care",
        "business",
        "transport",
        "rural",
      ],
      // Resident interests remain editable, but zero-eligibility nationality
      // buckets must not be added to the voting electorate by this content.
      "ethnicity:chinese": ["jobs", "labor", "schools", "health", "business", "immigration"],
      "ethnicity:korean": ["jobs", "schools", "health", "labor", "business", "immigration"],
      "ethnicity:southeast_asian": ["jobs", "labor", "skills", "health", "schools", "immigration"],
      "ethnicity:other_foreign": ["jobs", "labor", "schools", "health", "skills", "immigration"],
      "age:young": ["jobs", "skills", "labor", "tuition", "family", "transport"],
      "age:mid": ["jobs", "schools", "business", "labor", "family", "transport"],
      "age:mature": ["pensions", "jobs", "health", "care", "business", "tax"],
      "age:senior": ["pensions", "care", "health", "transport", "rural", "disaster"],
      "education:primary_or_below": ["pensions", "care", "health", "rural", "transport", "jobs"],
      "education:high_school": ["jobs", "skills", "health", "labor", "business", "transport"],
      "education:vocational": ["jobs", "skills", "business", "labor", "transport", "health"],
      "education:university": ["jobs", "research", "schools", "business", "labor", "transport"],
      "education:graduate": [
        "research",
        "jobs",
        "business",
        "schools",
        "environment",
        "health",
        "transport",
      ],
      "income:low": ["jobs", "health", "skills", "labor", "care", "schools"],
      "income:middle": ["jobs", "pensions", "schools", "health", "business", "tax"],
      "income:high": ["business", "tax", "jobs", "research", "schools", "transport"],
    },
    regions: {
      HOK: ["rural", "jobs"],
      TOH: ["rural", "jobs"],
      KAN: ["jobs", "transport"],
      CHU: ["business", "skills"],
      KNS: ["business", "jobs"],
      CGK: ["jobs", "care"],
      SHI: ["care", "rural"],
      KYU: ["rural", "jobs"],
    },
    groupRegions: {
      KAN: {
        "education:graduate": ["research", "jobs", "transport", "schools", "business", "rights"],
      },
      CHU: {
        "education:graduate": ["research", "business", "jobs", "skills", "schools", "transport"],
      },
      SHI: {
        "education:graduate": ["research", "care", "jobs", "schools", "business", "transport"],
      },
    },
  },
};
