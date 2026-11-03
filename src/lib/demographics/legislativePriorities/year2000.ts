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

function economic(
  lawTypeId: string,
  prefix: string,
  left = 1,
  centre = 2,
  right = 3
): HistoricalPriorityTopic {
  return {
    lawTypeId,
    levels: [left, centre, right].map((n) => `${prefix}_opt_${n}`) as [string, string, string],
    axis: "economicLean",
  };
}

function social(
  lawTypeId: string,
  prefix: string,
  left = 2,
  centre = 3,
  right = 4
): HistoricalPriorityTopic {
  return { ...economic(lawTypeId, prefix, left, centre, right), axis: "socialLean" };
}

const noIncomeTax = Object.fromEntries(
  // NH/TN had investment-income taxes, not broad wage-income taxes. Here 0%
  // is a request to remove the remaining levy, not a claim it was absent.
  ["AK", "FL", "NH", "NV", "SD", "TN", "TX", "WA", "WY"].map((region) => [
    region,
    {
      tax: { lawTypeId: "us_state_income_tax_rate", policyOptionId: "state_income_tax_rate_opt_0" },
    },
  ])
);

/** See year2000.sources.ts for evidence, limitations and catalogue omissions. */
export const YEAR_2000_PRIORITIES: Record<string, HistoricalPriorityCountry> = {
  US: {
    topics: {
      schools: economic("us_state_education_funding", "state_education_funding"),
      health: economic("us_state_healthcare", "state_healthcare"),
      pensions: economic("us_social_security", "social_security", 2, 2, 3),
      care: economic("us_medicaid", "medicaid", 1, 2, 3),
      prescriptions: economic("us_drug_pricing_medicare", "drug_pricing_medicare", 1, 1, 4),
      skills: economic("us_state_workforce_development", "state_workforce_development"),
      labor: economic("us_state_labor", "state_labor", 2, 3, 4),
      family: economic("us_paid_family_leave", "paid_family_leave", 2, 3, 4),
      transport: economic("us_state_transportation", "state_transportation"),
      housing: economic("us_state_housing", "state_housing", 2, 3, 4),
      tuition: economic("us_state_higher_education", "state_higher_education", 2, 3, 4),
      research: economic("us_federal_science_funding", "federal_science_funding"),
      business: economic("us_state_business_regulation", "state_business_regulation", 2, 3, 4),
      tax: economic("us_state_income_tax_rate", "state_income_tax_rate", 4, 3, 2),
      // Rural water/grid services, not food stamps as a proxy for farm policy.
      rural: economic("us_state_utilities", "state_utilities", 2, 3, 3),
      environment: economic("us_state_environment", "state_environment", 2, 3, 4),
      rights: social("us_civics_voting_rights", "civics_voting_rights", 1, 2, 3),
      crime: social("us_state_policing", "state_policing"),
      reproductive: social("us_reproductive_rights", "reproductive_rights"),
      firearms: social("us_gun_control", "gun_control"),
      immigration: social("us_legal_immigration_visas", "legal_immigration_visas"),
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
      health: economic("uk_nhs_funding", "uk_nhs_funding", 1, 2, 2),
      schools: economic("uk_regional_education", "uk_regional_education"),
      pensions: economic("uk_state_pensions", "uk_state_pensions", 1, 2, 3),
      care: economic("uk_social_care", "uk_social_care"),
      skills: economic("uk_regional_skills", "uk_regional_skills"),
      jobs: economic("uk_regional_economic_development", "uk_regional_economic_development"),
      labor: economic("uk_regional_labour", "uk_regional_labour", 2, 3, 4),
      family: economic("uk_childcare", "uk_childcare", 2, 3, 4),
      tuition: economic("uk_tuition_fees", "uk_tuition_fees", 2, 2, 3),
      housing: economic(
        "uk_regional_housing_development",
        "uk_regional_housing_development",
        2,
        3,
        4
      ),
      transport: economic("uk_regional_transport", "uk_regional_transport"),
      research: economic("uk_research_science", "uk_research_science"),
      business: economic("uk_business_rates", "uk_business_rates", 3, 2, 1),
      tax: economic("uk_council_tax", "uk_council_tax", 3, 2, 1),
      rural: economic("uk_agriculture_policy", "uk_agriculture_policy"),
      environment: economic("uk_regional_environment", "uk_regional_environment", 2, 3, 4),
      crime: social("uk_regional_policing", "uk_regional_policing"),
      // Community justice/victim support, not online voting as a civil-rights proxy.
      rights: economic("uk_regional_justice", "uk_regional_justice"),
      devolution: social("uk_devolution_local_powers", "uk_devolution_local_powers", 2, 3, 3),
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
      SCO: { tuition: { lawTypeId: "uk_tuition_fees", policyOptionId: "uk_tuition_fees_opt_0" } },
    },
  },
  JP: {
    topics: {
      jobs: economic("jp_regional_economic_development", "jp_regional_economic_development"),
      business: economic("jp_sme_support", "jp_sme_support", 1, 2, 3),
      skills: economic("jp_regional_skills", "jp_regional_skills"),
      labor: economic("jp_labor_reform", "jp_labor_reform", 2, 3, 4),
      health: economic("jp_national_health_insurance", "jp_national_health_insurance"),
      pensions: economic("jp_pension", "jp_pension", 2, 2, 3),
      care: economic("jp_elder_care", "jp_elder_care", 1, 2, 2),
      schools: economic("jp_regional_education", "jp_regional_education"),
      tuition: economic("jp_university_tuition", "jp_university_tuition", 2, 3, 3),
      research: economic("jp_research_science", "jp_research_science"),
      family: economic("jp_family_policy", "jp_family_policy", 2, 3, 3),
      tax: economic("jp_resident_tax", "jp_resident_tax", 2, 3, 4),
      rural: economic("jp_regional_agriculture", "jp_regional_agriculture", 1, 2, 2),
      transport: economic("jp_regional_transport", "jp_regional_transport"),
      disaster: economic("jp_disaster_preparedness", "jp_disaster_preparedness", 1, 2, 2),
      environment: economic("jp_regional_environment", "jp_regional_environment", 2, 3, 4),
      rights: social("jp_gender_equality", "jp_gender_equality", 2, 3, 3),
      immigration: social("jp_visa_residency", "jp_visa_residency", 2, 3, 4),
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
