/**
 * Electorate legislative priorities. Authored group interests and regional
 * emphasis determine which exact law levels appear on the strategy board;
 * see resolveLegislativePriorities in rules.ts. These have no electoral effects.
 */

export interface PriorityReference {
  lawTypeId: string;
  policyOptionId: string;
}

export type PriorityTopic =
  | "housing"
  | "tuition"
  | "schools"
  | "health"
  | "pensions"
  | "care"
  | "wages"
  | "labor"
  | "skills"
  | "family"
  | "transport"
  | "environment"
  | "business"
  | "tax"
  | "rights"
  | "immigration"
  | "rural"
  | "disaster"
  | "research"
  | "jobs"
  | "prescriptions"
  | "crime"
  | "reproductive"
  | "firearms"
  | "devolution";

interface PriorityCountry {
  topics: Partial<Record<PriorityTopic, PriorityReference>>;
  groups: Record<string, readonly PriorityTopic[]>;
  regions: Record<string, readonly PriorityTopic[]>;
}

// Explicit option ids, not array indices: reordering a law's ladder must not
// silently change what a group wants. Names are resolved from the law catalog.
function ref(lawTypeId: string, policyOptionId: string): PriorityReference {
  return { lawTypeId, policyOptionId };
}

const commonGroups: Record<string, readonly PriorityTopic[]> = {
  "age:young": ["housing", "tuition", "wages", "labor", "transport", "environment"],
  "age:mid": ["family", "schools", "housing", "tax", "labor", "transport"],
  "age:mature": ["health", "pensions", "tax", "skills", "care", "transport"],
  "age:senior": ["pensions", "care", "health", "tax", "transport", "disaster"],
  "income:low": ["wages", "housing", "health", "skills", "transport", "labor"],
  "income:middle": ["tax", "schools", "family", "health", "housing", "transport"],
  "income:high": ["tax", "business", "research", "schools", "transport", "environment"],
};

const practicalEducation: readonly PriorityTopic[] = [
  "skills",
  "wages",
  "health",
  "labor",
  "transport",
  "schools",
];
const higherEducation: readonly PriorityTopic[] = [
  "tuition",
  "research",
  "housing",
  "environment",
  "transport",
  "rights",
];
const postgraduate: readonly PriorityTopic[] = [
  "research",
  "tuition",
  "environment",
  "rights",
  "health",
  "transport",
];

/** Design content, not a claim about every individual within a demographic. */
export const PRIORITY_COUNTRIES: Record<string, PriorityCountry> = {
  US: {
    topics: {
      housing: ref("us.infrastructure.publicHousing.primary", "l4"),
      tuition: ref("us.education.attainment.primary", "l4"),
      schools: ref("us.education.universalSchooling.primary", "l3"),
      health: ref("us.health.outcomes.primary", "l3"),
      pensions: ref("us.health.socialInsurance.primary", "l3"),
      care: ref("us.health.universalCare.primary", "l3"),
      wages: ref("us.economy.workerSecurity.primary", "l3"),
      labor: ref("us.sec.laborManagementRelations", "l4"),
      skills: ref("us.education.adultSkills.primary", "l3"),
      family: ref("us.society.womensOpportunity.primary", "l3"),
      transport: ref("us.infrastructure.transit.primary", "l3"),
      environment: ref("us.environment.conservation.primary", "l3"),
      business: ref("us.infrastructure.development.primary", "l2"),
      tax: ref("us.tax.stateIncomeTax", "rate_5"),
      rights: ref("us.governance.participation.primary", "l4"),
      immigration: ref("us.sec.immigrationNationality", "l3"),
      rural: ref("us.economy.mobility.primary", "l3"),
      disaster: ref("us.sec.civilDefense", "l3"),
      research: ref("us.education.research.primary", "l3"),
    },
    groups: {
      ...commonGroups,
      "race:white": ["health", "tax", "schools", "pensions", "rural", "transport"],
      "race:black": ["rights", "wages", "health", "housing", "skills", "schools"],
      "race:hispanic": ["immigration", "wages", "schools", "housing", "health", "family"],
      "race:asian": ["schools", "immigration", "research", "business", "housing", "transport"],
      "race:other": ["rights", "health", "schools", "housing", "environment", "transport"],
      "education:no_college": practicalEducation,
      "education:college": higherEducation,
      "education:graduate": postgraduate,
      "wealth:low": commonGroups["income:low"],
      "wealth:middle": commonGroups["income:middle"],
      "wealth:high": commonGroups["income:high"],
    },
    // Regional emphasis changes ordering only among a group's own interests.
    regions: {
      AL: ["health", "wages"],
      AK: ["disaster", "rural"],
      AZ: ["housing", "immigration"],
      AR: ["health", "rural"],
      CA: ["housing", "environment"],
      CO: ["environment", "housing"],
      CT: ["tax", "research"],
      DE: ["business", "health"],
      DC: ["housing", "rights"],
      FL: ["care", "disaster"],
      GA: ["transport", "business"],
      HI: ["housing", "disaster"],
      ID: ["rural", "tax"],
      IL: ["transport", "labor"],
      IN: ["skills", "business"],
      IA: ["rural", "schools"],
      KS: ["rural", "tax"],
      KY: ["health", "skills"],
      LA: ["disaster", "wages"],
      ME: ["care", "rural"],
      MD: ["research", "transport"],
      MA: ["research", "tuition"],
      MI: ["labor", "skills"],
      MN: ["schools", "health"],
      MS: ["health", "wages"],
      MO: ["skills", "transport"],
      MT: ["rural", "environment"],
      NE: ["rural", "schools"],
      NV: ["housing", "wages"],
      NH: ["tax", "business"],
      NJ: ["tax", "transport"],
      NM: ["schools", "rights"],
      NY: ["housing", "transport"],
      NC: ["skills", "research"],
      ND: ["rural", "transport"],
      OH: ["skills", "labor"],
      OK: ["rural", "health"],
      OR: ["environment", "housing"],
      PA: ["labor", "pensions"],
      RI: ["housing", "care"],
      SC: ["business", "skills"],
      SD: ["rural", "health"],
      TN: ["business", "tax"],
      TX: ["business", "immigration"],
      UT: ["family", "schools"],
      VT: ["environment", "care"],
      VA: ["transport", "research"],
      WA: ["housing", "research"],
      WV: ["health", "pensions"],
      WI: ["labor", "rural"],
      WY: ["rural", "tax"],
    },
  },
  UK: {
    topics: {
      housing: ref("uk.infrastructure.publicHousing.primary", "l4"),
      tuition: ref("uk.sec.universityGrants", "l4"),
      schools: ref("uk.education.universalSchooling.primary", "l3"),
      health: ref("uk.health.universalCare.primary", "l4"),
      pensions: ref("uk.health.socialInsurance.primary", "l3"),
      care: ref("uk.sec.nationalAssistanceReform", "l3"),
      wages: ref("uk.economy.workerSecurity.primary", "l3"),
      labor: ref("uk.sec.industrialRelations", "l4"),
      skills: ref("uk.education.adultSkills.primary", "l4"),
      family: ref("uk.society.womensOpportunity.primary", "l3"),
      transport: ref("uk.infrastructure.transit.primary", "l3"),
      environment: ref("uk.environment.conservation.primary", "l3"),
      business: ref("uk.tax.domesticCorporateTax", "rate_35"),
      tax: ref("uk.tax.incomeTax", "rate_24"),
      rights: ref("uk.governance.participation.primary", "l3"),
      immigration: ref("uk.sec.nationalityMigration", "l3"),
      rural: ref("uk.sec.agricultureDeficiency", "l3"),
      disaster: ref("uk.sec.civilDefenceCorps", "l3"),
      research: ref("uk.education.research.primary", "l3"),
      devolution: ref("uk.governance.localAutonomy.primary", "l4"),
    },
    groups: {
      ...commonGroups,
      "ethnicity:white_british": ["health", "tax", "pensions", "schools", "devolution", "rural"],
      "ethnicity:asian_british": [
        "schools",
        "business",
        "health",
        "housing",
        "immigration",
        "transport",
      ],
      "ethnicity:black_british": ["housing", "wages", "rights", "health", "schools", "skills"],
      "ethnicity:mixed": ["housing", "schools", "rights", "transport", "health", "family"],
      "ethnicity:other": ["immigration", "housing", "health", "skills", "schools", "rights"],
      "education:no_qualifications": practicalEducation,
      "education:gcse_equivalent": ["skills", "labor", "wages", "housing", "health", "transport"],
      "education:a_level_equivalent": [
        "tuition",
        "skills",
        "housing",
        "family",
        "transport",
        "schools",
      ],
      "education:degree_plus": higherEducation,
    },
    regions: {
      NEE: ["skills", "health"],
      NWE: ["labor", "transport"],
      YHU: ["skills", "labor"],
      EMI: ["skills", "transport"],
      WMI: ["labor", "schools"],
      EAE: ["schools", "research"],
      LON: ["housing", "transport"],
      SEE: ["tax", "housing"],
      SWE: ["rural", "care"],
      SCO: ["devolution", "tuition"],
      WAL: ["health", "skills"],
      NIR: ["devolution", "rights"],
    },
  },
  JP: {
    topics: {
      tuition: ref("jp_university_tuition", "jp_university_tuition_opt_1"),
      schools: ref("jp_regional_education", "jp_regional_education_opt_2"),
      health: ref("jp_national_health_insurance", "jp_national_health_insurance_opt_2"),
      pensions: ref("jp_pension", "jp_pension_opt_2"),
      care: ref("jp_elder_care", "jp_elder_care_opt_2"),
      wages: ref("jp_minimum_wage", "jp_minimum_wage_opt_2"),
      labor: ref("jp_labor_reform", "jp_labor_reform_opt_1"),
      skills: ref("jp_regional_skills", "jp_regional_skills_opt_2"),
      family: ref("jp_family_policy", "jp_family_policy_opt_1"),
      transport: ref("jp_regional_transport", "jp_regional_transport_opt_2"),
      environment: ref("jp_regional_environment", "jp_regional_environment_opt_2"),
      business: ref("jp_sme_support", "jp_sme_support_opt_2"),
      tax: ref("jp_resident_tax", "jp_resident_tax_opt_3"),
      rights: ref("jp_gender_equality", "jp_gender_equality_opt_2"),
      immigration: ref("jp_visa_residency", "jp_visa_residency_opt_2"),
      rural: ref("jp_regional_agriculture", "jp_regional_agriculture_opt_2"),
      disaster: ref("jp_disaster_preparedness", "jp_disaster_preparedness_opt_1"),
      research: ref("jp_research_science", "jp_research_science_opt_2"),
      devolution: ref("jp_regional_autonomy", "jp_regional_autonomy_opt_2"),
    },
    groups: {
      // Japan's law catalog has no housing ladder. Use actual family, work and
      // transport legislation instead of inventing a housing target.
      "age:young": ["tuition", "labor", "wages", "family", "transport", "rights"],
      "age:mid": ["family", "schools", "labor", "tax", "transport", "disaster"],
      "age:mature": ["pensions", "health", "tax", "care", "skills", "disaster"],
      "age:senior": ["pensions", "care", "health", "transport", "disaster", "rural"],
      "income:low": ["wages", "health", "skills", "labor", "family", "transport"],
      "income:middle": ["tax", "family", "schools", "health", "transport", "pensions"],
      "income:high": ["tax", "business", "research", "schools", "transport", "environment"],
      "ethnicity:japanese": ["pensions", "family", "health", "disaster", "rural", "transport"],
      "ethnicity:chinese": ["immigration", "business", "schools", "labor", "health", "transport"],
      "ethnicity:korean": ["immigration", "schools", "health", "labor", "business", "transport"],
      "ethnicity:southeast_asian": ["labor", "immigration", "wages", "skills", "health", "family"],
      "ethnicity:other_foreign": [
        "immigration",
        "labor",
        "schools",
        "health",
        "transport",
        "skills",
      ],
      "education:primary_or_below": [
        "pensions",
        "care",
        "health",
        "rural",
        "transport",
        "disaster",
      ],
      "education:high_school": practicalEducation,
      "education:vocational": ["skills", "labor", "wages", "business", "transport", "health"],
      "education:university": ["tuition", "labor", "research", "family", "transport", "rights"],
      "education:graduate": postgraduate,
    },
    regions: {
      HOK: ["rural", "transport"],
      TOH: ["disaster", "rural"],
      KAN: ["family", "transport"],
      CHU: ["business", "skills"],
      KNS: ["business", "research"],
      CGK: ["care", "skills"],
      SHI: ["care", "rural"],
      KYU: ["rural", "disaster"],
    },
  },
};
